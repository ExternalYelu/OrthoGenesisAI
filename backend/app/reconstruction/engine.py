from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Iterable

import numpy as np
import torch
import trimesh
from PIL import Image, ImageFilter, ImageOps
try:
    from scipy import ndimage as ndi
except Exception:  # pragma: no cover - optional runtime dependency
    ndi = None

from app.storage.local import save_confidence_report, save_model


@dataclass
class XRayInput:
    view: str
    content_type: str
    data: bytes


@dataclass
class ReconstructionResult:
    confidence: float
    mesh_key: str
    notes: str | None = None
    confidence_report: dict[str, Any] | None = None
    pipeline_version: str = "heightmap-v1"
    confidence_version: str = "confidence-v1"
    uncertainty_map_key: str | None = None


class ReconstructionEngine:
    """
    Stub engine: replace with production CNN/Transformer pipeline.
    For single-image testing, generates a heightmap mesh from the X-ray.
    """

    def reconstruct(self, inputs: Iterable[XRayInput]) -> ReconstructionResult:
        input_list = list(inputs)

        # Placeholder tensor to validate CUDA plumbing and torch availability.
        _dummy = torch.zeros((64, 64, 64))

        mesh_key, confidence_report = self._mesh_from_inputs(input_list)
        is_multiview = len(input_list) >= 3
        return ReconstructionResult(
            confidence=float(confidence_report.get("overall_confidence", 0.62)),
            mesh_key=mesh_key,
            notes=(
                "Multi-view 3D reconstruction from AP/lateral/oblique X-rays"
                if is_multiview
                else "Single-view 2.5D depth reconstruction from one X-ray"
            ),
            confidence_report=confidence_report,
            pipeline_version="heightmap-v1",
            confidence_version="confidence-v1",
        )

    def _mesh_from_inputs(self, inputs: list[XRayInput]) -> tuple[str, dict[str, Any]]:
        maps: list[np.ndarray] = []
        for idx, item in enumerate(inputs):
            sigma = 1.0 + min(0.35, idx * 0.04)
            maps.append(self._extract_bone_heightmap(item.data, target_size=512, blur_sigma=sigma))

        if not maps:
            raise ValueError("No input images were provided")

        base = maps[0]
        resized: list[np.ndarray] = [base]
        for hm in maps[1:]:
            if hm.shape == base.shape:
                resized.append(hm)
                continue
            image = Image.fromarray(np.clip(hm * 255.0, 0, 255).astype(np.uint8))
            image = image.resize((base.shape[1], base.shape[0]), Image.Resampling.BILINEAR)
            resized.append(np.asarray(image, dtype=np.float32) / 255.0)

        if len(resized) == 1:
            heightmap = resized[0]
            mode = "single-view-heightmap"
        else:
            stack = np.stack(resized, axis=0)
            # Weighted blend to preserve strong contours while reducing single-view artifacts.
            heightmap = np.maximum(np.mean(stack, axis=0), np.max(stack, axis=0) * 0.72)
            mode = "multi-view-heightmap"

        heightmap = self._clean_heightmap(heightmap)
        heightmap = self._refine_heightmap(heightmap)
        mesh, confidence_report = self._heightmap_to_mesh(heightmap, height_scale=46.0, surface_floor=0.008)
        confidence_report["mode"] = mode
        confidence_report["input_views"] = len(inputs)
        glb = mesh.export(file_type="glb")
        if isinstance(glb, str):
            glb_bytes = glb.encode("utf-8")
        else:
            glb_bytes = glb
        mesh_key = save_model(glb_bytes, ext="glb")
        save_confidence_report(mesh_key, confidence_report)
        return mesh_key, confidence_report

    def _extract_bone_heightmap(self, data: bytes, target_size: int, blur_sigma: float) -> np.ndarray:
        image = Image.open(BytesIO(data)).convert("L")
        image.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
        image = image.filter(ImageFilter.MedianFilter(size=3))
        image = image.filter(ImageFilter.GaussianBlur(radius=blur_sigma))
        image = ImageOps.autocontrast(image, cutoff=0)

        pixels = np.asarray(image, dtype=np.uint8)
        pixels_f32 = pixels.astype(np.float32)

        mean = float(np.mean(pixels_f32))
        stddev = float(np.std(pixels_f32))
        p_low = float(np.percentile(pixels_f32, 2.0))
        p_high = float(np.percentile(pixels_f32, 98.0))
        threshold = min(255.0, max(mean + stddev * 0.28, float(np.percentile(pixels_f32, 70.0))))

        # Blend adaptive threshold with full intensity map to preserve internal bone contours.
        norm = np.clip((pixels_f32 - p_low) / max(1.0, p_high - p_low), 0.0, 1.0)
        mask = np.clip((pixels_f32 - threshold) / max(1.0, 255.0 - threshold), 0.0, 1.0)
        bone = (0.62 * mask + 0.38 * np.clip(norm - 0.2, 0.0, 1.0)).astype(np.float32)

        if bone.size == 0:
            return np.zeros((2, 2), dtype=np.float32)

        # Smooth staircase artifacts and normalize final range.
        smooth = Image.fromarray(np.clip(bone * 255.0, 0, 255).astype(np.uint8))
        smooth = smooth.filter(ImageFilter.MedianFilter(size=5))
        smooth = smooth.filter(ImageFilter.GaussianBlur(radius=1.05))
        bone = np.asarray(smooth, dtype=np.float32) / 255.0
        if np.max(bone) > 0:
            bone = bone / np.max(bone)
        bone = np.power(bone, 0.86)
        bone[bone < 0.006] = 0.0
        return bone

    def _clean_heightmap(self, heightmap: np.ndarray) -> np.ndarray:
        if heightmap.size == 0:
            return heightmap

        positive = heightmap[heightmap > 0]
        if positive.size < 24:
            return heightmap

        mask_floor = max(0.01, float(np.percentile(positive, 12)) * 0.45)
        binary = heightmap > mask_floor
        if not np.any(binary):
            return heightmap

        mask = self._largest_connected_component(binary)
        if not np.any(mask):
            return heightmap

        if ndi is not None:
            mask = ndi.binary_closing(mask, structure=np.ones((5, 5), dtype=bool), iterations=2)
            mask = ndi.binary_opening(mask, structure=np.ones((3, 3), dtype=bool), iterations=1)
            mask = ndi.binary_fill_holes(mask)
            mask = ndi.binary_dilation(mask, iterations=1)
            mask = self._largest_connected_component(mask)
        else:
            mask = self._close_mask(mask, size=5, iterations=2)
            mask = self._open_mask(mask, size=3, iterations=1)
            # Fill internal holes so STL export becomes a solid, printable body.
            mask = self._fill_holes(mask)
            mask = self._largest_connected_component(mask)

        cleaned = np.where(mask, heightmap, 0.0).astype(np.float32)
        cleaned = self._smooth_heightmap(cleaned, mask, radius=1.25)

        ys, xs = np.where(mask)
        margin = 10
        y0 = max(0, int(ys.min()) - margin)
        y1 = min(cleaned.shape[0], int(ys.max()) + margin + 1)
        x0 = max(0, int(xs.min()) - margin)
        x1 = min(cleaned.shape[1], int(xs.max()) + margin + 1)
        return cleaned[y0:y1, x0:x1]

    def _refine_heightmap(self, heightmap: np.ndarray) -> np.ndarray:
        if heightmap.size == 0:
            return heightmap

        image = Image.fromarray(np.clip(heightmap * 255.0, 0, 255).astype(np.uint8))
        rows, cols = heightmap.shape
        max_side = max(rows, cols)
        target_max = 600
        if max_side < target_max:
            scale = target_max / float(max_side)
            resized = image.resize(
                (max(2, int(cols * scale)), max(2, int(rows * scale))),
                Image.Resampling.BICUBIC,
            )
        else:
            resized = image

        refined = resized.filter(ImageFilter.GaussianBlur(radius=0.95))
        refined_map = np.asarray(refined, dtype=np.float32) / 255.0

        # Blend keeps bone contours while suppressing blocky/spotty artifacts.
        if refined_map.shape == heightmap.shape:
            blended = 0.58 * refined_map + 0.42 * heightmap
        else:
            blended = refined_map
        blended = np.clip(blended, 0.0, 1.0).astype(np.float32)
        blended[blended < 0.004] = 0.0
        return blended

    def _largest_connected_component(self, mask: np.ndarray) -> np.ndarray:
        rows, cols = mask.shape
        visited = np.zeros_like(mask, dtype=bool)
        best_cells: list[tuple[int, int]] = []

        for y in range(rows):
            for x in range(cols):
                if not mask[y, x] or visited[y, x]:
                    continue
                queue: deque[tuple[int, int]] = deque([(y, x)])
                visited[y, x] = True
                component: list[tuple[int, int]] = []

                while queue:
                    cy, cx = queue.popleft()
                    component.append((cy, cx))
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if ny < 0 or ny >= rows or nx < 0 or nx >= cols:
                            continue
                        if visited[ny, nx] or not mask[ny, nx]:
                            continue
                        visited[ny, nx] = True
                        queue.append((ny, nx))

                if len(component) > len(best_cells):
                    best_cells = component

        largest = np.zeros_like(mask, dtype=bool)
        for y, x in best_cells:
            largest[y, x] = True
        return largest

    def _close_mask(self, mask: np.ndarray, size: int, iterations: int) -> np.ndarray:
        result = mask.copy()
        for _ in range(iterations):
            dilated = Image.fromarray((result.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(size=size))
            eroded = dilated.filter(ImageFilter.MinFilter(size=size))
            result = np.asarray(eroded, dtype=np.uint8) > 0
        return result

    def _open_mask(self, mask: np.ndarray, size: int, iterations: int) -> np.ndarray:
        result = mask.copy()
        for _ in range(iterations):
            eroded = Image.fromarray((result.astype(np.uint8) * 255)).filter(ImageFilter.MinFilter(size=size))
            dilated = eroded.filter(ImageFilter.MaxFilter(size=size))
            result = np.asarray(dilated, dtype=np.uint8) > 0
        return result

    def _smooth_heightmap(self, heightmap: np.ndarray, mask: np.ndarray, radius: float) -> np.ndarray:
        image = Image.fromarray(np.clip(heightmap * 255.0, 0, 255).astype(np.uint8))
        blurred = image.filter(ImageFilter.GaussianBlur(radius=radius))
        blurred_map = np.asarray(blurred, dtype=np.float32) / 255.0

        blended = np.where(mask, np.maximum(heightmap * 0.72, blurred_map * 0.9), 0.0).astype(np.float32)

        if ndi is not None:
            soft = ndi.gaussian_filter(mask.astype(np.float32), sigma=0.9)
            if np.max(soft) > 0:
                soft = soft / np.max(soft)
            blended *= np.clip(soft * 1.18, 0.0, 1.0)
        else:
            soft_mask = Image.fromarray((mask.astype(np.uint8) * 255)).filter(ImageFilter.GaussianBlur(radius=0.75))
            soft = np.asarray(soft_mask, dtype=np.float32) / 255.0
            blended *= np.clip(soft * 1.2, 0.0, 1.0)

        blended = np.clip(blended, 0.0, 1.0)
        return blended


    def _fill_holes(self, mask: np.ndarray) -> np.ndarray:
        rows, cols = mask.shape
        inverse = ~mask
        outside = np.zeros_like(mask, dtype=bool)
        queue: deque[tuple[int, int]] = deque()

        def seed(y: int, x: int) -> None:
            if inverse[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))

        for x in range(cols):
            seed(0, x)
            seed(rows - 1, x)
        for y in range(rows):
            seed(y, 0)
            seed(y, cols - 1)

        while queue:
            cy, cx = queue.popleft()
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if ny < 0 or ny >= rows or nx < 0 or nx >= cols:
                    continue
                if outside[ny, nx] or not inverse[ny, nx]:
                    continue
                outside[ny, nx] = True
                queue.append((ny, nx))

        holes = inverse & ~outside
        return mask | holes

    def _heightmap_to_mesh(
        self, heightmap: np.ndarray, height_scale: float, surface_floor: float
    ) -> tuple[trimesh.Trimesh, dict[str, Any]]:
        rows, cols = heightmap.shape
        if rows < 2 or cols < 2:
            raise ValueError("Heightmap is too small to build a mesh")

        vertex_count = rows * cols
        total_vertices = vertex_count * 2
        positions = np.zeros((total_vertices, 3), dtype=np.float32)
        vertex_confidence = np.zeros((total_vertices,), dtype=np.float32)

        base_thickness = max(4.5, height_scale * 0.14)

        faces: list[list[int]] = []
        cell_active = np.zeros((rows - 1, cols - 1), dtype=bool)
        support = heightmap > surface_floor

        def top_index(y: int, x: int) -> int:
            return y * cols + x

        def bottom_index(y: int, x: int) -> int:
            return vertex_count + y * cols + x

        for y in range(rows):
            for x in range(cols):
                i = top_index(y, x)
                intensity = float(heightmap[y, x])
                positions[i, 0] = (x / cols - 0.5) * cols
                positions[i, 1] = intensity * height_scale
                positions[i, 2] = (y / rows - 0.5) * rows
                vertex_confidence[i] = self._top_vertex_confidence(heightmap, y, x, surface_floor)

                bi = bottom_index(y, x)
                positions[bi, 0] = positions[i, 0]
                positions[bi, 1] = -base_thickness
                positions[bi, 2] = positions[i, 2]
                vertex_confidence[bi] = 0.08

        for y in range(rows - 1):
            for x in range(cols - 1):
                if not (support[y, x] or support[y, x + 1] or support[y + 1, x] or support[y + 1, x + 1]):
                    continue
                cell_active[y, x] = True

        for y in range(rows - 1):
            for x in range(cols - 1):
                if not cell_active[y, x]:
                    continue

                tl = top_index(y, x)
                tr = top_index(y, x + 1)
                bl = top_index(y + 1, x)
                br = top_index(y + 1, x + 1)
                faces.append([tl, bl, tr])
                faces.append([tr, bl, br])

                btl = bottom_index(y, x)
                btr = bottom_index(y, x + 1)
                bbl = bottom_index(y + 1, x)
                bbr = bottom_index(y + 1, x + 1)
                faces.append([btl, btr, bbl])
                faces.append([btr, bbr, bbl])
                if y == 0 or not cell_active[y - 1, x]:
                    faces.append([tl, btl, tr])
                    faces.append([tr, btl, btr])
                if y == rows - 2 or not cell_active[y + 1, x]:
                    faces.append([bl, br, bbl])
                    faces.append([br, bbr, bbl])
                if x == 0 or not cell_active[y, x - 1]:
                    faces.append([tl, bl, btl])
                    faces.append([bl, bbl, btl])
                if x == cols - 2 or not cell_active[y, x + 1]:
                    faces.append([tr, btr, br])
                    faces.append([br, btr, bbr])

        if not faces:
            # Fallback if thresholding removed everything.
            faces = [[0, 1, cols], [1, cols + 1, cols], [vertex_count, vertex_count + 1, vertex_count + cols]]

        faces_array = np.array(faces, dtype=np.int64)
        used_vertices = np.unique(faces_array.reshape(-1))
        used_confidence = vertex_confidence[used_vertices]

        colors = self._confidence_to_colors(vertex_confidence)
        vertex_normals = self._compute_vertex_normals(positions, faces_array)
        mesh = trimesh.Trimesh(
            vertices=positions, faces=faces_array, vertex_normals=vertex_normals, process=False
        )
        mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, vertex_colors=colors)
        try:
            trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.52, iterations=4)
        except Exception:
            pass
        try:
            if len(mesh.faces) < 220_000:
                v, f = trimesh.remesh.subdivide_loop(mesh.vertices, mesh.faces, iterations=1)
                mesh = trimesh.Trimesh(vertices=v, faces=f, process=False)
                mesh.visual = trimesh.visual.ColorVisuals(
                    mesh=mesh,
                    vertex_colors=self._confidence_to_colors(
                        self._confidence_from_vertex_height(mesh.vertices[:, 1])
                    ),
                )
                trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=2)
        except Exception:
            pass
        # `fix_normals()` may require scipy via trimesh graph utilities.
        # In test mode we keep reconstruction robust and skip hard-fail if scipy is unavailable.
        try:
            mesh.fix_normals()
        except Exception:
            pass
        confidence_report = self._build_confidence_report(used_confidence, surface_floor)
        return mesh, confidence_report

    def _confidence_from_vertex_height(self, y_values: np.ndarray) -> np.ndarray:
        y = y_values.astype(np.float32)
        if y.size == 0:
            return y
        y_min = float(np.min(y))
        y_max = float(np.max(y))
        if abs(y_max - y_min) < 1e-6:
            return np.zeros_like(y, dtype=np.float32)
        normalized = (y - y_min) / (y_max - y_min)
        return np.clip(normalized, 0.0, 1.0).astype(np.float32)

    def _top_vertex_confidence(
        self, heightmap: np.ndarray, y: int, x: int, surface_floor: float
    ) -> float:
        h = float(heightmap[y, x])
        if h <= 0.0:
            return 0.0

        base = np.clip((h - surface_floor) / max(1e-6, 1.0 - surface_floor), 0.0, 1.0)

        y0 = max(0, y - 1)
        y1 = min(heightmap.shape[0], y + 2)
        x0 = max(0, x - 1)
        x1 = min(heightmap.shape[1], x + 2)
        patch = heightmap[y0:y1, x0:x1]
        local_support = float(np.mean(patch > surface_floor))
        edge_factor = 0.68 + 0.32 * local_support
        return float(np.clip((0.34 + 0.66 * base) * edge_factor, 0.0, 1.0))

    def _confidence_to_colors(self, confidence: np.ndarray) -> np.ndarray:
        # Colorblind-safe palette: blue (observed), amber (adjusted), magenta (inferred).
        c = np.clip(confidence.astype(np.float32), 0.0, 1.0)
        low = np.array([192.0, 38.0, 211.0], dtype=np.float32)
        mid = np.array([245.0, 158.0, 11.0], dtype=np.float32)
        high = np.array([47.0, 122.0, 229.0], dtype=np.float32)

        t_low = np.clip(c / 0.5, 0.0, 1.0)[:, None]
        t_high = np.clip((c - 0.5) / 0.5, 0.0, 1.0)[:, None]
        rgb_low = low[None, :] * (1.0 - t_low) + mid[None, :] * t_low
        rgb_high = mid[None, :] * (1.0 - t_high) + high[None, :] * t_high
        rgb = np.where((c[:, None] <= 0.5), rgb_low, rgb_high)

        rgba = np.zeros((confidence.shape[0], 4), dtype=np.uint8)
        rgba[:, :3] = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
        rgba[:, 3] = 255
        return rgba

    def _build_confidence_report(self, used_confidence: np.ndarray, surface_floor: float) -> dict[str, Any]:
        if used_confidence.size == 0:
            return {
                "overall_confidence": 0.0,
                "observed_ratio": 0.0,
                "adjusted_ratio": 0.0,
                "inferred_ratio": 1.0,
                "observed_threshold": 0.72,
                "adjusted_threshold": 0.32,
                "surface_floor": surface_floor,
                "mode": "single-view-heightmap",
            }

        observed_threshold = 0.72
        adjusted_threshold = 0.32
        observed_ratio = float(np.mean(used_confidence >= observed_threshold))
        adjusted_ratio = float(
            np.mean((used_confidence >= adjusted_threshold) & (used_confidence < observed_threshold))
        )
        inferred_ratio = float(np.mean(used_confidence < adjusted_threshold))
        overall_confidence = float(np.mean(used_confidence))
        bins = np.linspace(0.0, 1.0, 11)
        hist, _ = np.histogram(used_confidence, bins=bins)

        return {
            "overall_confidence": round(overall_confidence, 4),
            "observed_ratio": round(observed_ratio, 4),
            "adjusted_ratio": round(adjusted_ratio, 4),
            "inferred_ratio": round(inferred_ratio, 4),
            "vertex_count": int(used_confidence.size),
            "confidence_histogram_10bin": hist.tolist(),
            "observed_threshold": observed_threshold,
            "adjusted_threshold": adjusted_threshold,
            "surface_floor": round(float(surface_floor), 4),
            "mode": "single-view-heightmap",
        }

    def _compute_vertex_normals(self, vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
        normals = np.zeros_like(vertices, dtype=np.float32)
        tri = vertices[faces]
        face_normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        face_len = np.linalg.norm(face_normals, axis=1, keepdims=True)
        face_normals = np.divide(
            face_normals,
            face_len,
            out=np.zeros_like(face_normals),
            where=face_len > 1e-12,
        )

        np.add.at(normals, faces[:, 0], face_normals)
        np.add.at(normals, faces[:, 1], face_normals)
        np.add.at(normals, faces[:, 2], face_normals)

        norm_len = np.linalg.norm(normals, axis=1, keepdims=True)
        normals = np.divide(
            normals,
            norm_len,
            out=np.zeros_like(normals),
            where=norm_len > 1e-12,
        )
        return normals
