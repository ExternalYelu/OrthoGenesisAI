from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Iterable

import numpy as np
import torch

from app.reconstruction.engine import ReconstructionResult, XRayInput
from app.reconstruction.registry import model_registry


@dataclass
class PipelineStatus:
    step: str
    progress: int
    message: str


def set_deterministic_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


class ReconstructionPipeline:
    def __init__(self, model_name: str = "heightmap", seed: int = 42, batch_size: int = 4) -> None:
        self.model = model_registry.get(model_name)
        self.seed = seed
        self.batch_size = max(1, batch_size)

    def run(self, inputs: Iterable[XRayInput]) -> tuple[ReconstructionResult, list[PipelineStatus]]:
        statuses: list[PipelineStatus] = []
        statuses.append(PipelineStatus("preprocessing", 10, "Noise reduction and normalization"))
        statuses.append(PipelineStatus("alignment", 35, "Aligning multi-view geometry"))
        statuses.append(PipelineStatus("inference", 65, f"Running inference with model '{self.model.name}'"))
        statuses.append(PipelineStatus("refinement", 85, "Refining mesh and confidence maps"))

        set_deterministic_seed(self.seed)
        result = self.model.reconstruct(inputs)
        result.pipeline_version = self.model.pipeline_version
        statuses.append(PipelineStatus("complete", 100, "Reconstruction ready"))
        return result, statuses

    def run_batch(self, batches: list[list[XRayInput]]) -> list[ReconstructionResult]:
        """
        Batch execution path for GPU-friendly workloads.
        This executes in deterministic chunks and can be parallelized by worker processes.
        """
        set_deterministic_seed(self.seed)
        results: list[ReconstructionResult] = []
        for i in range(0, len(batches), self.batch_size):
            for case_inputs in batches[i : i + self.batch_size]:
                result = self.model.reconstruct(case_inputs)
                result.pipeline_version = self.model.pipeline_version
                results.append(result)
        return results
