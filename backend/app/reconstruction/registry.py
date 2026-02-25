from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Protocol

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
