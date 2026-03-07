from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Protocol

import numpy as np

from app.reconstruction.engine import ReconstructionEngine, ReconstructionResult, XRayInput


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
    """Scaffold for a learned multi-view 3D reconstruction model.

    This model is intended to replace the heightmap heuristic with a
    neural implicit field (e.g. occupancy network or NeRF-style decoder)
    trained on paired X-ray / CT data.  The current implementation delegates
    to the heightmap engine so the pipeline remains functional while the
    learned model is developed.

    Integration checklist:
    1. Train encoder on paired AP/lateral/oblique ↔ CT volume data.
    2. Replace ``_predict_field`` with the trained network forward pass.
    3. Swap marching-cubes iso-surface extraction for the heightmap fallback.
    4. Update ``pipeline_version`` to reflect the trained model checkpoint.
    """

    name: str = "implicit-field"
    pipeline_version: str = "implicit-field-v0"
    view_config: dict[str, Any] = field(default_factory=lambda: {
        "ap": {"azimuth": 0.0, "elevation": 0.0},
        "lateral": {"azimuth": 90.0, "elevation": 0.0},
        "oblique": {"azimuth": 45.0, "elevation": 15.0},
    })

    def __post_init__(self) -> None:
        self._fallback = ReconstructionEngine()

    def reconstruct(self, inputs: Iterable[XRayInput]) -> ReconstructionResult:
        input_list = list(inputs)
        views = {inp.view.lower(): inp for inp in input_list}

        # When the learned encoder is available, call _predict_field and
        # run marching cubes.  Until then, fall back to the heightmap engine.
        result = self._fallback.reconstruct(input_list)
        result.pipeline_version = self.pipeline_version
        result.notes = (
            f"Implicit-field scaffold ({len(views)} view(s)). "
            "Currently delegating to heightmap engine; replace with trained model."
        )
        return result

    def _predict_field(
        self, views: dict[str, XRayInput], grid_resolution: int = 128
    ) -> np.ndarray:
        """Placeholder: returns a zero occupancy grid.

        When the trained model is integrated, this method should:
        1. Encode each view with the multi-view encoder.
        2. Fuse latent codes with view-aware cross-attention.
        3. Decode an occupancy / SDF field on a 3D grid.
        """
        return np.zeros((grid_resolution,) * 3, dtype=np.float32)


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
