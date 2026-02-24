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
        heightmap = self._extract_bone_heightmap(data, target_size=256, blur_sigma=1.5)
        mesh = self._heightmap_to_mesh(heightmap, height_scale=30.0)
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
        image = ImageOps.autocontrast(image)

        pixels = np.asarray(image, dtype=np.uint8)
        pixels_f32 = pixels.astype(np.float32)

        mean = float(np.mean(pixels_f32))
        stddev = float(np.std(pixels_f32))
        threshold = min(255.0, mean + stddev * 0.5)

        bone = np.where(pixels_f32 >= threshold, pixels_f32, 0.0)
        return bone / 255.0

    def _heightmap_to_mesh(self, heightmap: np.ndarray, height_scale: float) -> trimesh.Trimesh:
        rows, cols = heightmap.shape
        if rows < 2 or cols < 2:
            raise ValueError("Heightmap is too small to build a mesh")

        vertex_count = rows * cols
        positions = np.zeros((vertex_count, 3), dtype=np.float32)

        faces: list[list[int]] = []
        for y in range(rows):
            for x in range(cols):
                i = y * cols + x
                intensity = float(heightmap[y, x])
                positions[i, 0] = (x / cols - 0.5) * cols
                positions[i, 1] = intensity * height_scale
                positions[i, 2] = (y / rows - 0.5) * rows

        for y in range(rows - 1):
            for x in range(cols - 1):
                tl = y * cols + x
                tr = tl + 1
                bl = (y + 1) * cols + x
                br = bl + 1
                faces.append([tl, bl, tr])
                faces.append([tr, bl, br])

        mesh = trimesh.Trimesh(vertices=positions, faces=np.array(faces, dtype=np.int64), process=False)
        # `fix_normals()` may require scipy via trimesh graph utilities.
        # In test mode we keep reconstruction robust and skip hard-fail if scipy is unavailable.
        try:
            mesh.fix_normals()
        except Exception:
            pass
        return mesh
