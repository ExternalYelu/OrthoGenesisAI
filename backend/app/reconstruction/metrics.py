"""Quantitative validation metrics for 3D reconstruction quality.

This module provides surface-distance and landmark-based metrics used to
benchmark reconstructed meshes against ground-truth CT-derived surfaces.

All functions accept raw vertex arrays (N×3 float32) so they are agnostic
to the mesh library used upstream.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass
class SurfaceMetrics:
    chamfer_distance: float
    hausdorff_distance: float
    mean_surface_distance: float
    median_surface_distance: float
    percentile_95: float


@dataclass
class LandmarkMetrics:
    mean_error_mm: float
    max_error_mm: float
    per_landmark: dict[str, float]


@dataclass
class ValidationReport:
    surface: SurfaceMetrics
    landmarks: LandmarkMetrics | None
    anatomy: str
    pipeline_version: str
    notes: str | None = None


def _pairwise_distances(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Compute pairwise L2 distances between point sets *a* (M×3) and *b* (N×3).

    Returns an (M,) array where each entry is the distance from a[i] to its
    nearest neighbour in *b*.
    """
    # Chunked to avoid OOM on large meshes.
    chunk = 4096
    nearest = np.empty(a.shape[0], dtype=np.float64)
    for start in range(0, a.shape[0], chunk):
        end = min(start + chunk, a.shape[0])
        diff = a[start:end, None, :] - b[None, :, :]  # (chunk, N, 3)
        dists = np.sqrt((diff * diff).sum(axis=-1))  # (chunk, N)
        nearest[start:end] = dists.min(axis=1)
    return nearest


def chamfer_distance(pred: np.ndarray, gt: np.ndarray) -> float:
    """Symmetric Chamfer distance (mean of both directions)."""
    d_pred_to_gt = _pairwise_distances(pred, gt)
    d_gt_to_pred = _pairwise_distances(gt, pred)
    return float(0.5 * (d_pred_to_gt.mean() + d_gt_to_pred.mean()))


def hausdorff_distance(pred: np.ndarray, gt: np.ndarray) -> float:
    """Symmetric Hausdorff distance (max of both directions)."""
    d_pred_to_gt = _pairwise_distances(pred, gt)
    d_gt_to_pred = _pairwise_distances(gt, pred)
    return float(max(d_pred_to_gt.max(), d_gt_to_pred.max()))


def surface_metrics(pred: np.ndarray, gt: np.ndarray) -> SurfaceMetrics:
    """Compute a full suite of surface-distance metrics."""
    d_pred = _pairwise_distances(pred, gt)
    d_gt = _pairwise_distances(gt, pred)
    all_dists = np.concatenate([d_pred, d_gt])
    return SurfaceMetrics(
        chamfer_distance=float(0.5 * (d_pred.mean() + d_gt.mean())),
        hausdorff_distance=float(max(d_pred.max(), d_gt.max())),
        mean_surface_distance=float(all_dists.mean()),
        median_surface_distance=float(np.median(all_dists)),
        percentile_95=float(np.percentile(all_dists, 95)),
    )


def landmark_error(
    pred_landmarks: dict[str, tuple[float, float, float]],
    gt_landmarks: dict[str, tuple[float, float, float]],
) -> LandmarkMetrics:
    """Per-landmark Euclidean error between predicted and ground-truth positions."""
    common = sorted(set(pred_landmarks) & set(gt_landmarks))
    if not common:
        return LandmarkMetrics(mean_error_mm=float("inf"), max_error_mm=float("inf"), per_landmark={})

    errors: dict[str, float] = {}
    for name in common:
        p = np.array(pred_landmarks[name], dtype=np.float64)
        g = np.array(gt_landmarks[name], dtype=np.float64)
        errors[name] = float(np.linalg.norm(p - g))

    vals = list(errors.values())
    return LandmarkMetrics(
        mean_error_mm=float(np.mean(vals)),
        max_error_mm=float(np.max(vals)),
        per_landmark=errors,
    )


def build_validation_report(
    pred_vertices: np.ndarray,
    gt_vertices: np.ndarray,
    anatomy: str,
    pipeline_version: str,
    pred_landmarks: dict[str, tuple[float, float, float]] | None = None,
    gt_landmarks: dict[str, tuple[float, float, float]] | None = None,
) -> ValidationReport:
    """One-call convenience to compute all validation metrics."""
    sm = surface_metrics(pred_vertices, gt_vertices)
    lm = None
    if pred_landmarks and gt_landmarks:
        lm = landmark_error(pred_landmarks, gt_landmarks)
    return ValidationReport(
        surface=sm,
        landmarks=lm,
        anatomy=anatomy,
        pipeline_version=pipeline_version,
    )
