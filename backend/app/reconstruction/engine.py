from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from io import BytesIO
from typing import Iterable

import numpy as np
import torch
import trimesh
from PIL import Image, ImageFilter, ImageOps

from app.storage.local import save_model


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


class ReconstructionEngine:
    """
    Stub engine: replace with production CNN/Transformer pipeline.
    For single-image testing, generates a heightmap mesh from the X-ray.
    """

    def reconstruct(self, inputs: Iterable[XRayInput]) -> ReconstructionResult:
        input_list = list(inputs)

        # Placeholder tensor to validate CUDA plumbing and torch availability.
        _dummy = torch.zeros((64, 64, 64))

        if len(input_list) == 1:
            mesh_key = self._mesh_from_xray(input_list[0].data)
            return ReconstructionResult(
                confidence=0.62,
                mesh_key=mesh_key,
                notes="Single-image heightmap mesh (test mode)",
            )

        obj = """# OrthoGenesisAI placeholder mesh\n"""
        obj += "v 0 0 0\n"
        obj += "v 1 0 0\n"
        obj += "v 1 1 0\n"
        obj += "v 0 1 0\n"
        obj += "v 0 0 1\n"
        obj += "v 1 0 1\n"
        obj += "v 1 1 1\n"
        obj += "v 0 1 1\n"
        obj += "f 1 2 3 4\n"
        obj += "f 5 6 7 8\n"
        obj += "f 1 2 6 5\n"
        obj += "f 2 3 7 6\n"
        obj += "f 3 4 8 7\n"
        obj += "f 4 1 5 8\n"

        mesh = trimesh.load(BytesIO(obj.encode("utf-8")), file_type="obj")
        glb = mesh.export(file_type="glb")
        mesh_key = save_model(glb, ext="glb")
        return ReconstructionResult(confidence=0.86, mesh_key=mesh_key, notes="Stub mesh")

    def _mesh_from_xray(self, data: bytes) -> str:
        heightmap = self._extract_bone_heightmap(data, target_size=300, blur_sigma=0.95)
        heightmap = self._clean_heightmap(heightmap)
        mesh = self._heightmap_to_mesh(heightmap, height_scale=46.0, surface_floor=0.014)
        glb = mesh.export(file_type="glb")
        if isinstance(glb, str):
            glb_bytes = glb.encode("utf-8")
        else:
            glb_bytes = glb
        mesh_key = save_model(glb_bytes, ext="glb")
        return mesh_key

    def _extract_bone_heightmap(self, data: bytes, target_size: int, blur_sigma: float) -> np.ndarray:
        image = Image.open(BytesIO(data)).convert("L")
        image.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
        image = image.filter(ImageFilter.GaussianBlur(radius=blur_sigma))
        image = ImageOps.autocontrast(image, cutoff=0)
        image = ImageOps.equalize(image)

        pixels = np.asarray(image, dtype=np.uint8)
        pixels_f32 = pixels.astype(np.float32)

        mean = float(np.mean(pixels_f32))
        stddev = float(np.std(pixels_f32))
        p_low = float(np.percentile(pixels_f32, 2.0))
        p_high = float(np.percentile(pixels_f32, 98.0))
        threshold = min(255.0, max(mean + stddev * 0.28, float(np.percentile(pixels_f32, 66.0))))

        # Preserve full tonal detail while suppressing non-bone background.
        norm = np.clip((pixels_f32 - p_low) / max(1.0, p_high - p_low), 0.0, 1.0)
        threshold_norm = np.clip((threshold - p_low) / max(1.0, p_high - p_low), 0.08, 0.95)
        bone = np.clip((norm - threshold_norm) / max(0.04, 1.0 - threshold_norm), 0.0, 1.0).astype(
            np.float32
        )

        if bone.size == 0:
            return np.zeros((2, 2), dtype=np.float32)

        # Smooth staircase artifacts and normalize final range.
        smooth = Image.fromarray(np.clip(bone * 255.0, 0, 255).astype(np.uint8))
        smooth = smooth.filter(ImageFilter.GaussianBlur(radius=0.6))
        bone = np.asarray(smooth, dtype=np.float32) / 255.0
        if np.max(bone) > 0:
            bone = bone / np.max(bone)
        bone = np.power(bone, 0.88)
        bone[bone < 0.006] = 0.0
        return bone

    def _clean_heightmap(self, heightmap: np.ndarray) -> np.ndarray:
        if heightmap.size == 0:
            return heightmap

        positive = heightmap[heightmap > 0]
        if positive.size < 24:
            return heightmap

        mask_floor = max(0.018, float(np.percentile(positive, 22)) * 0.55)
        binary = heightmap > mask_floor
        if not np.any(binary):
            return heightmap

        # Close tiny breaks and remove isolated speckles.
        mask_img = Image.fromarray((binary.astype(np.uint8) * 255))
        mask_img = mask_img.filter(ImageFilter.MaxFilter(size=5))
        mask_img = mask_img.filter(ImageFilter.MinFilter(size=5))
        mask = np.asarray(mask_img, dtype=np.uint8) > 127

        mask = self._largest_connected_component(mask)
        if not np.any(mask):
            return heightmap

        # Fill internal holes so STL export becomes a solid, printable body.
        mask = self._fill_holes(mask)

        cleaned = np.where(mask, heightmap, 0.0).astype(np.float32)
        cleaned[(mask) & (cleaned < 0.012)] = 0.012

        ys, xs = np.where(mask)
        margin = 6
        y0 = max(0, int(ys.min()) - margin)
        y1 = min(cleaned.shape[0], int(ys.max()) + margin + 1)
        x0 = max(0, int(xs.min()) - margin)
        x1 = min(cleaned.shape[1], int(xs.max()) + margin + 1)
        return cleaned[y0:y1, x0:x1]

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

    def _heightmap_to_mesh(self, heightmap: np.ndarray, height_scale: float, surface_floor: float) -> trimesh.Trimesh:
        rows, cols = heightmap.shape
        if rows < 2 or cols < 2:
            raise ValueError("Heightmap is too small to build a mesh")

        vertex_count = rows * cols
        total_vertices = vertex_count * 2
        positions = np.zeros((total_vertices, 3), dtype=np.float32)

        base_thickness = max(4.5, height_scale * 0.14)

        faces: list[list[int]] = []
        cell_active = np.zeros((rows - 1, cols - 1), dtype=bool)

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

                bi = bottom_index(y, x)
                positions[bi, 0] = positions[i, 0]
                positions[bi, 1] = -base_thickness
                positions[bi, 2] = positions[i, 2]

        for y in range(rows - 1):
            for x in range(cols - 1):
                h_tl = float(heightmap[y, x])
                h_tr = float(heightmap[y, x + 1])
                h_bl = float(heightmap[y + 1, x])
                h_br = float(heightmap[y + 1, x + 1])
                if max(h_tl, h_tr, h_bl, h_br) < surface_floor:
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
        vertex_normals = self._compute_vertex_normals(positions, faces_array)
        mesh = trimesh.Trimesh(
            vertices=positions, faces=faces_array, vertex_normals=vertex_normals, process=False
        )
        # `fix_normals()` may require scipy via trimesh graph utilities.
        # In test mode we keep reconstruction robust and skip hard-fail if scipy is unavailable.
        try:
            mesh.fix_normals()
        except Exception:
            pass
        return mesh

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
