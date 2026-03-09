from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Protocol

import numpy as np

from app.reconstruction.engine import ReconstructionEngine, ReconstructionResult, XRayInput
from app.reconstruction.volumetric import VolumetricReconstructionModel

logger = logging.getLogger(__name__)

# Checkpoint path — set by env var or defaults to data/checkpoints/best.pt
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_CHECKPOINT = _PROJECT_ROOT.parent / "data" / "checkpoints" / "best.pt"


class ReconstructionModel(Protocol):
    name: str
    pipeline_version: str

    def reconstruct(self, inputs: Iterable[XRayInput]) -> ReconstructionResult:
        ...


@dataclass
class HeightmapModel:
    name: str = "heightmap"
    pipeline_version: str = "heightmap-v1"

    def __post_init__(self) -> None:
        self._engine = ReconstructionEngine()

    def reconstruct(self, inputs: Iterable[XRayInput]) -> ReconstructionResult:
        result = self._engine.reconstruct(inputs)
        result.pipeline_version = self.pipeline_version
        return result


@dataclass
class ImplicitFieldModel:
    """Neural implicit field model for learned multi-view 3D reconstruction.

    Uses the trained XRayTo3DNet to predict a 3D occupancy field from
    multi-view X-ray images, then extracts a mesh via marching cubes.

    Falls back to the heightmap engine if no trained checkpoint is available.
    """

    name: str = "implicit-field"
    pipeline_version: str = "implicit-field-v1"
    grid_resolution: int = 128

    def __post_init__(self) -> None:
        import os
        self._fallback = ReconstructionEngine()
        self._model = None
        self._device = None

        checkpoint_path = os.environ.get("NEURAL_CHECKPOINT", str(_DEFAULT_CHECKPOINT))
        if Path(checkpoint_path).exists():
            self._load_model(checkpoint_path)
        else:
            logger.warning(
                "No neural checkpoint found at %s — implicit-field will use heightmap fallback",
                checkpoint_path,
            )

    def _load_model(self, path: str) -> None:
        import torch
        from app.reconstruction.train import load_checkpoint

        self._device = torch.device("cpu")
        self._model, state = load_checkpoint(path, self._device)
        self._model.eval()
        epoch = state.get("epoch", "?")
        val_loss = state.get("val_loss", "?")
        logger.info(
            "Neural model loaded: epoch=%s, val_loss=%s, device=%s",
            epoch, val_loss, self._device,
        )

    def reconstruct(self, inputs: Iterable[XRayInput]) -> ReconstructionResult:
        input_list = list(inputs)
        views = {inp.view.lower(): inp for inp in input_list}

        if self._model is None:
            logger.info("No trained model — using heightmap fallback")
            result = self._fallback.reconstruct(input_list)
            result.pipeline_version = self.pipeline_version
            result.notes = (
                f"Implicit-field ({len(views)} view(s)): no checkpoint, using heightmap fallback. "
                "Train with: python -m app.reconstruction.train"
            )
            return result

        return self._neural_reconstruct(views)

    def _neural_reconstruct(self, views: dict[str, XRayInput]) -> ReconstructionResult:
        import torch
        from PIL import Image
        from skimage import measure

        from app.storage.local import save_model, save_confidence_report

        # Convert X-ray bytes → (1, 1, H, W) tensors
        view_tensors: dict[str, torch.Tensor] = {}
        img_size = 128
        for vname, xray in views.items():
            img = Image.open(io.BytesIO(xray.data)).convert("L").resize((img_size, img_size))
            arr = np.array(img, dtype=np.float32) / 255.0
            view_tensors[vname] = torch.from_numpy(arr).float().unsqueeze(0).unsqueeze(0)

        # Predict occupancy grid
        with torch.no_grad():
            occupancy = self._model.predict_grid(
                view_tensors, resolution=self.grid_resolution
            )

        prob = occupancy.numpy()

        # Marching cubes to extract mesh
        threshold = 0.5
        try:
            verts, faces, normals, _ = measure.marching_cubes(
                prob, level=threshold, spacing=(1.0, 1.0, 1.0)
            )
        except ValueError:
            logger.warning("Marching cubes failed — volume may be empty")
            result = self._fallback.reconstruct(list(views.values()))
            result.notes = "Neural prediction was empty, used heightmap fallback"
            return result

        # Center and scale vertices
        verts = verts - verts.mean(axis=0)
        max_extent = np.abs(verts).max()
        if max_extent > 0:
            verts = verts / max_extent * 50.0

        # Build GLB
        glb_bytes = self._build_glb(verts, faces, normals)

        # Save
        mesh_key = save_model(glb_bytes, ext="glb")

        # Confidence metrics
        bone_fraction = (prob > threshold).mean()
        mean_confidence = prob[prob > threshold].mean() if bone_fraction > 0 else 0.0
        confidence = float(np.clip(mean_confidence * 0.9 + 0.1, 0.3, 0.95))

        report = {
            "method": "neural-implicit-field",
            "views_used": list(views.keys()),
            "grid_resolution": self.grid_resolution,
            "threshold": threshold,
            "bone_fraction": float(bone_fraction),
            "mean_bone_confidence": float(mean_confidence),
            "vertex_count": len(verts),
            "face_count": len(faces),
        }
        save_confidence_report(mesh_key, report)

        return ReconstructionResult(
            confidence=confidence,
            mesh_key=mesh_key,
            notes=f"Neural implicit field ({len(views)} view(s)), "
                  f"{len(verts)} verts, {len(faces)} faces, "
                  f"confidence={confidence:.2f}",
            confidence_report=report,
            pipeline_version=self.pipeline_version,
        )

    @staticmethod
    def _build_glb(verts: np.ndarray, faces: np.ndarray, normals: np.ndarray) -> bytes:
        """Build a minimal GLB (glTF binary) from mesh data."""
        import struct

        verts = verts.astype(np.float32)
        faces = faces.astype(np.uint32)
        normals = normals.astype(np.float32)

        vert_bytes = verts.tobytes()
        face_bytes = faces.tobytes()
        norm_bytes = normals.tobytes()

        vert_min = verts.min(axis=0).tolist()
        vert_max = verts.max(axis=0).tolist()

        import json
        gltf = {
            "asset": {"version": "2.0", "generator": "OrthoGenesisAI-NeuralImplicit"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0}],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 2}, "indices": 1}]}],
            "accessors": [
                {"bufferView": 0, "componentType": 5126, "count": len(verts), "type": "VEC3",
                 "min": vert_min, "max": vert_max},
                {"bufferView": 1, "componentType": 5125, "count": faces.size, "type": "SCALAR",
                 "min": [0], "max": [int(verts.shape[0] - 1)]},
                {"bufferView": 2, "componentType": 5126, "count": len(normals), "type": "VEC3"},
            ],
            "bufferViews": [
                {"buffer": 0, "byteOffset": 0, "byteLength": len(vert_bytes), "target": 34962},
                {"buffer": 0, "byteOffset": len(vert_bytes), "byteLength": len(face_bytes), "target": 34963},
                {"buffer": 0, "byteOffset": len(vert_bytes) + len(face_bytes), "byteLength": len(norm_bytes), "target": 34962},
            ],
            "buffers": [{"byteLength": len(vert_bytes) + len(face_bytes) + len(norm_bytes)}],
        }

        gltf_json = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        # Pad JSON to 4-byte alignment
        while len(gltf_json) % 4 != 0:
            gltf_json += b" "

        bin_data = vert_bytes + face_bytes + norm_bytes
        while len(bin_data) % 4 != 0:
            bin_data += b"\x00"

        total = 12 + 8 + len(gltf_json) + 8 + len(bin_data)
        out = io.BytesIO()
        out.write(struct.pack("<4sII", b"glTF", 2, total))
        out.write(struct.pack("<I4s", len(gltf_json), b"JSON"))
        out.write(gltf_json)
        out.write(struct.pack("<I4s", len(bin_data), b"BIN\x00"))
        out.write(bin_data)
        return out.getvalue()


class ModelRegistry:
    def __init__(self) -> None:
        self._models: dict[str, ReconstructionModel] = {}

    def register(self, model: ReconstructionModel) -> None:
        self._models[model.name] = model

    def get(self, name: str) -> ReconstructionModel:
        model = self._models.get(name)
        if model is None:
            available = ", ".join(sorted(self._models.keys()))
            raise ValueError(f"Unknown reconstruction model '{name}'. Available: {available}")
        return model

    def list_models(self) -> list[str]:
        return sorted(self._models.keys())


model_registry = ModelRegistry()
model_registry.register(HeightmapModel())
model_registry.register(ImplicitFieldModel())
model_registry.register(VolumetricReconstructionModel())
