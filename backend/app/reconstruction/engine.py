from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Iterable

import numpy as np
import torch
import trimesh
from PIL import Image, ImageOps

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
        image = Image.open(BytesIO(data))
        image = ImageOps.grayscale(image)
        image = ImageOps.autocontrast(image)
        image = image.resize((128, 128))

        heightmap = np.asarray(image, dtype=np.float32)
        heightmap = (heightmap - heightmap.min()) / (heightmap.max() - heightmap.min() + 1e-6)

        mesh = self._heightmap_to_mesh(heightmap, height_scale=0.4)
        glb = mesh.export(file_type="glb")
        if isinstance(glb, str):
            glb_bytes = glb.encode("utf-8")
        else:
            glb_bytes = glb
        mesh_key = save_model(glb_bytes, ext="glb")
        return mesh_key

    def _heightmap_to_mesh(self, heightmap: np.ndarray, height_scale: float) -> trimesh.Trimesh:
        rows, cols = heightmap.shape
        xs = np.linspace(0.0, 1.0, cols, dtype=np.float32)
        ys = np.linspace(0.0, 1.0, rows, dtype=np.float32)
        grid_x, grid_y = np.meshgrid(xs, ys)
        z = heightmap * height_scale

        top_vertices = np.stack([grid_x, grid_y, z], axis=-1).reshape(-1, 3)
        base_vertices = np.stack([grid_x, grid_y, np.zeros_like(z)], axis=-1).reshape(-1, 3)
        vertices = np.vstack([top_vertices, base_vertices])

        faces: list[list[int]] = []
        offset = rows * cols

        def add_quad(a: int, b: int, c: int, d: int) -> None:
            faces.append([a, b, c])
            faces.append([b, d, c])

        for i in range(rows - 1):
            for j in range(cols - 1):
                v0 = i * cols + j
                v1 = v0 + 1
                v2 = v0 + cols
                v3 = v2 + 1
                add_quad(v0, v2, v1, v3)
                b0 = v0 + offset
                b1 = v1 + offset
                b2 = v2 + offset
                b3 = v3 + offset
                add_quad(b0, b1, b2, b3)

        for j in range(cols - 1):
            v0 = j
            v1 = j + 1
            b0 = v0 + offset
            b1 = v1 + offset
            add_quad(v0, v1, b0, b1)

            v2 = (rows - 1) * cols + j
            v3 = v2 + 1
            b2 = v2 + offset
            b3 = v3 + offset
            add_quad(v3, v2, b3, b2)

        for i in range(rows - 1):
            v0 = i * cols
            v1 = (i + 1) * cols
            b0 = v0 + offset
            b1 = v1 + offset
            add_quad(v1, v0, b1, b0)

            v2 = i * cols + (cols - 1)
            v3 = v2 + cols
            b2 = v2 + offset
            b3 = v3 + offset
            add_quad(v2, v3, b2, b3)

        vertices[:, 0] -= 0.5
        vertices[:, 1] -= 0.5

        return trimesh.Trimesh(vertices=vertices, faces=np.array(faces), process=False)
