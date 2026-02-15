from dataclasses import dataclass
from typing import Iterable

from app.reconstruction.engine import ReconstructionEngine, XRayInput, ReconstructionResult


@dataclass
class PipelineStatus:
    step: str
    progress: int
    message: str


class ReconstructionPipeline:
    def __init__(self) -> None:
        self.engine = ReconstructionEngine()

    def run(self, inputs: Iterable[XRayInput]) -> tuple[ReconstructionResult, list[PipelineStatus]]:
        statuses: list[PipelineStatus] = []
        statuses.append(PipelineStatus("preprocessing", 10, "Noise reduction and normalization"))
        statuses.append(PipelineStatus("alignment", 35, "Aligning multi-view geometry"))
        statuses.append(PipelineStatus("inference", 65, "Running model inference"))
        statuses.append(PipelineStatus("refinement", 85, "Refining mesh"))

        result = self.engine.reconstruct(inputs)
        statuses.append(PipelineStatus("complete", 100, "Reconstruction ready"))
        return result, statuses
