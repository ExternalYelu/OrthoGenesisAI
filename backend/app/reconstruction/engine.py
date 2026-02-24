from __future__ import annotations

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
        mesh = self._heightmap_to_mesh(heightmap, height_scale=46.0, surface_floor=0.0)
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

    def _heightmap_to_mesh(self, heightmap: np.ndarray, height_scale: float, surface_floor: float) -> trimesh.Trimesh:
        rows, cols = heightmap.shape
        if rows < 2 or cols < 2:
            raise ValueError("Heightmap is too small to build a mesh")

        vertex_count = rows * cols
        total_vertices = vertex_count * 2
        positions = np.zeros((total_vertices, 3), dtype=np.float32)

        underside_img = Image.fromarray(np.clip(heightmap * 255.0, 0, 255).astype(np.uint8))
        underside_img = underside_img.filter(ImageFilter.GaussianBlur(radius=1.4))
        underside = np.asarray(underside_img, dtype=np.float32) / 255.0
        if np.max(underside) > 0:
            underside = underside / np.max(underside)

        base_thickness = max(4.0, height_scale * 0.12)
        underside_relief = height_scale * 0.22

        faces: list[list[int]] = []

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
                positions[bi, 1] = -base_thickness - float(underside[y, x]) * underside_relief
                positions[bi, 2] = positions[i, 2]

        for y in range(rows - 1):
            for x in range(cols - 1):
                h_tl = float(heightmap[y, x])
                h_tr = float(heightmap[y, x + 1])
                h_bl = float(heightmap[y + 1, x])
                h_br = float(heightmap[y + 1, x + 1])
                if surface_floor > 0.0 and max(h_tl, h_tr, h_bl, h_br) < surface_floor:
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

        # Seal boundary walls so the mesh has visible thickness from below.
        for x in range(cols - 1):
            # Top boundary (outward -Z)
            a, b = top_index(0, x), top_index(0, x + 1)
            c, d = bottom_index(0, x), bottom_index(0, x + 1)
            faces.append([a, b, c])
            faces.append([b, d, c])

            # Bottom boundary (outward +Z)
            a, b = top_index(rows - 1, x), top_index(rows - 1, x + 1)
            c, d = bottom_index(rows - 1, x), bottom_index(rows - 1, x + 1)
            faces.append([a, c, b])
            faces.append([b, c, d])

        for y in range(rows - 1):
            # Left boundary (outward -X)
            a, b = top_index(y, 0), top_index(y + 1, 0)
            c, d = bottom_index(y, 0), bottom_index(y + 1, 0)
            faces.append([a, c, b])
            faces.append([b, c, d])

            # Right boundary (outward +X)
            a, b = top_index(y, cols - 1), top_index(y + 1, cols - 1)
            c, d = bottom_index(y, cols - 1), bottom_index(y + 1, cols - 1)
            faces.append([a, b, c])
            faces.append([b, d, c])

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
