"""Volumetric 3D Reconstruction Engine
=====================================

Combines Visual Hull initialization with Differentiable Volume Rendering (DRR)
optimization to reconstruct true 3D bone models from 2–3 X-ray views.

Pipeline:
    1. Bone segmentation from each X-ray view
    2. Visual hull construction via silhouette back-projection
    3. Iterative refinement via differentiable DRR rendering + gradient descent
    4. Isosurface extraction via marching cubes
    5. Mesh post-processing (smoothing, decimation, confidence coloring)
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import Any, Iterable

import numpy as np
import torch
import torch.nn.functional as F
import trimesh
from PIL import Image
from scipy import ndimage
from skimage.measure import marching_cubes

from app.reconstruction.engine import ReconstructionResult, XRayInput
from app.storage.local import save_confidence_report, save_model

logger = logging.getLogger(__name__)


# ── Configuration ─────────────────────────────────────────────────────


@dataclass
class VolumetricConfig:
    grid_resolution: int = 128
    drr_iterations: int = 300
    learning_rate: float = 0.008
    tv_weight: float = 0.015
    sparsity_weight: float = 0.002
    surface_threshold: float = 0.35
    smoothing_iterations: int = 3
    bone_threshold: float = 0.25
    min_bone_area_ratio: float = 0.001
    physical_size: float = 100.0
    device: str = "auto"


# ── View projection geometry ─────────────────────────────────────────

VIEW_GEOMETRY: dict[str, dict[str, Any]] = {
    "ap": {
        "azimuth": 0.0,
        "elevation": 0.0,
        "project_axis": 2,
    },
    "lateral": {
        "azimuth": 90.0,
        "elevation": 0.0,
        "project_axis": 0,
    },
    "oblique": {
        "azimuth": 45.0,
        "elevation": 15.0,
        "project_axis": None,
    },
}


def _rotation_matrix(azimuth_deg: float, elevation_deg: float) -> np.ndarray:
    az = np.radians(azimuth_deg)
    el = np.radians(elevation_deg)
    ca, sa = np.cos(az), np.sin(az)
    ce, se = np.cos(el), np.sin(el)
    Ry = np.array([[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]])
    Rx = np.array([[1, 0, 0], [0, ce, -se], [0, se, ce]])
    return Rx @ Ry


# ── Bone segmentation ────────────────────────────────────────────────


def segment_bone(
    image_bytes: bytes,
    threshold: float = 0.25,
    min_area_ratio: float = 0.001,
) -> tuple[np.ndarray, np.ndarray]:
    """Extract bone mask and normalised intensity from an X-ray."""
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    arr = np.array(img, dtype=np.float32) / 255.0

    local_mean = ndimage.uniform_filter(arr, size=max(arr.shape) // 8)
    adaptive = arr > (local_mean + threshold * 0.5)
    strong_global = arr > (threshold * 1.5)
    mask = adaptive | strong_global

    mask = ndimage.binary_closing(mask, iterations=2)
    mask = ndimage.binary_opening(mask, iterations=1)
    mask = ndimage.binary_fill_holes(mask)

    labeled, n = ndimage.label(mask)
    if n > 1:
        min_px = arr.size * min_area_ratio
        for i in range(1, n + 1):
            if (labeled == i).sum() < min_px:
                mask[labeled == i] = False

    return mask.astype(np.float32), arr


# ── Visual hull ──────────────────────────────────────────────────────


def _resize_mask(mask: np.ndarray, resolution: int) -> np.ndarray:
    pil = Image.fromarray((mask * 255).astype(np.uint8)).resize(
        (resolution, resolution), Image.BILINEAR
    )
    return (np.array(pil, dtype=np.float32) / 255.0 > 0.5).astype(np.float32)


def _oblique_back_project(
    mask: np.ndarray, rotation: np.ndarray, resolution: int
) -> np.ndarray:
    coords = np.linspace(-1, 1, resolution)
    xx, yy, zz = np.meshgrid(coords, coords, coords, indexing="ij")
    pts = np.stack([xx.ravel(), yy.ravel(), zz.ravel()], axis=1)
    rotated = pts @ rotation.T
    px = ((rotated[:, 0] + 1) / 2 * (resolution - 1)).astype(np.int32).clip(0, resolution - 1)
    py = ((rotated[:, 1] + 1) / 2 * (resolution - 1)).astype(np.int32).clip(0, resolution - 1)
    return mask[py, px].reshape(resolution, resolution, resolution)


def build_visual_hull(
    masks: dict[str, np.ndarray], resolution: int = 128
) -> np.ndarray:
    """Intersect back-projected silhouettes to form a visual hull."""
    volume = np.ones((resolution, resolution, resolution), dtype=np.float32)

    for view, mask in masks.items():
        m = _resize_mask(mask, resolution)
        geom = VIEW_GEOMETRY.get(view)
        if geom is None:
            logger.warning("Unknown view '%s', skipping", view)
            continue

        axis = geom["project_axis"]
        if axis is not None:
            if axis == 2:
                hull = np.broadcast_to(m[:, :, np.newaxis], volume.shape).copy()
            elif axis == 0:
                hull = np.broadcast_to(m[np.newaxis, :, :], volume.shape).copy()
            else:
                hull = np.broadcast_to(m[:, np.newaxis, :], volume.shape).copy()
        else:
            rot = _rotation_matrix(geom["azimuth"], geom["elevation"])
            hull = _oblique_back_project(m, rot, resolution)

        volume *= hull

    return volume


# ── Differentiable DRR rendering ─────────────────────────────────────


def _oblique_drr(
    volume: torch.Tensor, azimuth_deg: float, elevation_deg: float
) -> torch.Tensor:
    N = volume.shape[0]
    dtype, device = volume.dtype, volume.device

    az = torch.tensor(np.radians(azimuth_deg), dtype=dtype, device=device)
    el = torch.tensor(np.radians(elevation_deg), dtype=dtype, device=device)
    ca, sa = torch.cos(az), torch.sin(az)
    ce, se = torch.cos(el), torch.sin(el)

    rot = torch.tensor(
        [
            [ca, sa * se, sa * ce],
            [0, ce, -se],
            [-sa, ca * se, ca * ce],
        ],
        dtype=dtype,
        device=device,
    )
    affine = torch.zeros(1, 3, 4, dtype=dtype, device=device)
    affine[0, :3, :3] = rot
    grid = F.affine_grid(affine, (1, 1, N, N, N), align_corners=True)
    rotated = F.grid_sample(
        volume.unsqueeze(0).unsqueeze(0),
        grid,
        mode="bilinear",
        padding_mode="zeros",
        align_corners=True,
    )
    return rotated.squeeze(0).squeeze(0).sum(dim=2)


def render_drr(volume: torch.Tensor, view: str) -> torch.Tensor:
    """Render a digitally-reconstructed radiograph (orthographic)."""
    geom = VIEW_GEOMETRY.get(view)
    if geom is not None and geom["project_axis"] is not None:
        return volume.sum(dim=geom["project_axis"])
    az = VIEW_GEOMETRY.get(view, {}).get("azimuth", 45.0)
    el = VIEW_GEOMETRY.get(view, {}).get("elevation", 15.0)
    return _oblique_drr(volume, az, el)


def _total_variation_3d(v: torch.Tensor) -> torch.Tensor:
    return (
        torch.abs(v[1:] - v[:-1]).mean()
        + torch.abs(v[:, 1:] - v[:, :-1]).mean()
        + torch.abs(v[:, :, 1:] - v[:, :, :-1]).mean()
    )


def refine_volume(
    volume_init: np.ndarray,
    targets: dict[str, np.ndarray],
    config: VolumetricConfig,
) -> np.ndarray:
    """Optimise a 3D volume so its DRR projections match the real X-rays."""
    device = (
        torch.device("cuda" if torch.cuda.is_available() else "cpu")
        if config.device == "auto"
        else torch.device(config.device)
    )
    logger.info("DRR optimisation on %s for %d iterations", device, config.drr_iterations)

    resolution = volume_init.shape[0]
    volume = torch.tensor(volume_init, dtype=torch.float32, device=device).requires_grad_(True)
    optimiser = torch.optim.Adam([volume], lr=config.learning_rate)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimiser, T_max=config.drr_iterations, eta_min=config.learning_rate * 0.1
    )

    target_tensors: dict[str, torch.Tensor] = {}
    for vname, img in targets.items():
        resized = np.array(
            Image.fromarray((img * 255).astype(np.uint8)).resize(
                (resolution, resolution), Image.BILINEAR
            ),
            dtype=np.float32,
        ) / 255.0
        target_tensors[vname] = torch.tensor(resized, dtype=torch.float32, device=device)

    best_loss = float("inf")
    best_vol = volume_init.copy()

    for it in range(config.drr_iterations):
        optimiser.zero_grad()
        recon_loss = torch.tensor(0.0, device=device)
        for vname, tgt in target_tensors.items():
            drr = render_drr(volume, vname)
            mx = drr.max()
            drr_norm = drr / mx if mx > 1e-8 else drr
            recon_loss = recon_loss + F.mse_loss(drr_norm, tgt)

        tv = _total_variation_3d(volume)
        sparsity = volume.mean()
        loss = recon_loss + config.tv_weight * tv + config.sparsity_weight * sparsity

        loss.backward()
        optimiser.step()
        scheduler.step()

        with torch.no_grad():
            volume.clamp_(0.0, 1.0)

        val = loss.item()
        if val < best_loss:
            best_loss = val
            best_vol = volume.detach().cpu().numpy().copy()

        if it % 50 == 0:
            logger.info(
                "  iter %4d/%d | loss=%.6f recon=%.6f tv=%.6f",
                it, config.drr_iterations, val, recon_loss.item(), tv.item(),
            )

    logger.info("DRR optimisation complete. Best loss: %.6f", best_loss)
    return best_vol


# ── Mesh extraction ──────────────────────────────────────────────────


def extract_isosurface(
    volume: np.ndarray,
    threshold: float = 0.35,
    smoothing_iters: int = 3,
    physical_size: float = 100.0,
) -> tuple[trimesh.Trimesh, np.ndarray]:
    smoothed = ndimage.gaussian_filter(volume, sigma=0.8)
    spacing = tuple(physical_size / s for s in volume.shape)

    verts, faces, normals, _ = marching_cubes(smoothed, level=threshold, spacing=spacing)
    verts -= verts.mean(axis=0)

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals)

    components = mesh.split(only_watertight=False)
    if components:
        mesh = max(components, key=lambda c: c.area)

    if smoothing_iters > 0:
        trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=smoothing_iters)

    mesh.fix_normals()
    return mesh, smoothed


# ── Confidence ───────────────────────────────────────────────────────


def compute_confidence(
    volume: np.ndarray, mesh: trimesh.Trimesh, n_views: int, physical_size: float = 100.0
) -> tuple[np.ndarray, dict[str, Any]]:
    res = volume.shape[0]
    verts = mesh.vertices + physical_size / 2
    vc = (verts / physical_size * (res - 1)).astype(np.int32).clip(0, res - 1)
    densities = volume[vc[:, 0], vc[:, 1], vc[:, 2]]
    conf = np.clip(densities, 0, 1)
    overall = float(np.mean(conf))
    view_factor = min(n_views / 3.0, 1.0)
    overall_adj = overall * (0.7 + 0.3 * view_factor)

    report: dict[str, Any] = {
        "overall_confidence": round(overall_adj, 4),
        "mean_density": round(float(np.mean(densities)), 4),
        "n_views": n_views,
        "view_coverage_factor": round(view_factor, 4),
        "high_confidence_ratio": round(float((conf > 0.5).mean()), 4),
        "low_confidence_ratio": round(float((conf < 0.2).mean()), 4),
        "reconstruction_method": "visual_hull_drr",
    }
    return conf, report


def apply_confidence_colors(mesh: trimesh.Trimesh, conf: np.ndarray) -> trimesh.Trimesh:
    colors = np.zeros((len(conf), 4), dtype=np.uint8)
    for i, c in enumerate(conf):
        if c > 0.6:
            colors[i] = [37, 99, 235, 255]
        elif c > 0.3:
            t = (c - 0.3) / 0.3
            colors[i] = [
                int(245 * (1 - t) + 37 * t),
                int(158 * (1 - t) + 99 * t),
                int(11 * (1 - t) + 235 * t),
                255,
            ]
        else:
            t = c / 0.3
            colors[i] = [
                int(236 * (1 - t) + 245 * t),
                int(72 * (1 - t) + 158 * t),
                int(153 * (1 - t) + 11 * t),
                255,
            ]
    mesh.visual.vertex_colors = colors
    return mesh


# ── Model class ──────────────────────────────────────────────────────


@dataclass
class VolumetricReconstructionModel:
    """True 3D reconstruction: Visual Hull → DRR Optimisation → Marching Cubes."""

    name: str = "volumetric"
    pipeline_version: str = "volumetric-v1"
    config: VolumetricConfig = field(default_factory=VolumetricConfig)

    def reconstruct(self, inputs: Iterable[XRayInput]) -> ReconstructionResult:
        input_list = list(inputs)
        n_views = len(input_list)
        logger.info("Volumetric reconstruction with %d view(s)", n_views)

        # 1. Segment bone from each view
        masks: dict[str, np.ndarray] = {}
        intensities: dict[str, np.ndarray] = {}
        for xray in input_list:
            view = xray.view.lower()
            mask, intensity = segment_bone(
                xray.data,
                threshold=self.config.bone_threshold,
                min_area_ratio=self.config.min_bone_area_ratio,
            )
            masks[view] = mask
            intensities[view] = intensity
            logger.info("  Segmented %s: mask covers %.1f%% of image", view, mask.mean() * 100)

        # 2. Build visual hull
        logger.info("Building visual hull …")
        volume = build_visual_hull(masks, self.config.grid_resolution)
        logger.info("  Visual hull fill ratio: %.1f%%", volume.mean() * 100)

        # 3. Refine with differentiable rendering
        logger.info("Starting DRR optimisation …")
        volume = refine_volume(volume, intensities, self.config)

        # 4. Extract isosurface
        logger.info("Extracting isosurface …")
        mesh, smoothed = extract_isosurface(
            volume,
            threshold=self.config.surface_threshold,
            smoothing_iters=self.config.smoothing_iterations,
            physical_size=self.config.physical_size,
        )
        logger.info("  Mesh: %d vertices, %d faces", len(mesh.vertices), len(mesh.faces))

        # 5. Confidence colouring
        conf, report = compute_confidence(smoothed, mesh, n_views, self.config.physical_size)
        mesh = apply_confidence_colors(mesh, conf)

        # 6. Export GLB
        glb = mesh.export(file_type="glb")
        glb_bytes = glb if isinstance(glb, bytes) else glb.encode("utf-8")
        mesh_key = save_model(glb_bytes, ext="glb")
        save_confidence_report(mesh_key, report)

        return ReconstructionResult(
            confidence=report["overall_confidence"],
            mesh_key=mesh_key,
            notes=(
                f"Volumetric reconstruction from {n_views} view(s). "
                f"Visual hull + DRR optimisation ({self.config.drr_iterations} iters). "
                f"Grid {self.config.grid_resolution}³."
            ),
            confidence_report=report,
            pipeline_version=self.pipeline_version,
        )
