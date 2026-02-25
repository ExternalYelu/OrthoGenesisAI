from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class ConfidenceCalibrator:
    """
    Lightweight calibration layer loaded from a persisted validation profile.
    """

    def __init__(self, version: str = "calib-v1") -> None:
        self.version = version
        self.slope = 0.92
        self.intercept = 0.04
        self._load_profile()

    def _load_profile(self) -> None:
        profile_path = Path(__file__).resolve().parents[2] / "data" / "calibration" / f"{self.version}.json"
        if not profile_path.exists():
            return
        try:
            data = json.loads(profile_path.read_text(encoding="utf-8"))
            self.slope = float(data.get("slope", self.slope))
            self.intercept = float(data.get("intercept", self.intercept))
        except Exception:
            return

    def calibrate(self, raw_confidence: float) -> float:
        calibrated = self.slope * float(raw_confidence) + self.intercept
        return max(0.0, min(1.0, calibrated))

    def build_uncertainty_map(self, report: dict[str, Any] | None) -> dict[str, Any]:
        report = report or {}
        bins = report.get("confidence_histogram_10bin") or []
        total = max(1, int(sum(int(v) for v in bins)) if bins else 1)
        probabilities = [round(float(v) / total, 6) for v in bins] if bins else []
        return {
            "calibration_version": self.version,
            "uncertainty_histogram_10bin": probabilities,
            "observed_ratio": report.get("observed_ratio", 0.0),
            "adjusted_ratio": report.get("adjusted_ratio", 0.0),
            "inferred_ratio": report.get("inferred_ratio", 1.0),
        }
