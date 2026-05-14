"""Training Data Pipeline
========================

Generates paired (X-ray, occupancy) training data from CT volumes.

Supports two data sources:
    1. Real CT scans in NIfTI format (.nii / .nii.gz) from public datasets
       (CTpelvic1K, TotalSegmentator, VerSe, etc.)
    2. Synthetic procedural bone shapes for bootstrapping when no CT data
       is available

Each training sample consists of:
    - Multi-view synthetic X-rays (AP, lateral, oblique) generated via DRR
    - 3D query points sampled from the volume
    - Binary occupancy labels (1 = inside bone, 0 = outside)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from torch.utils.data import Dataset

from app.reconstruction.drr_projector import generate_drr_set

logger = logging.getLogger(__name__)

# ── CT volume loading ────────────────────────────────────────────────


def load_nifti_volume(path: str | Path, target_size: int = 64) -> np.ndarray:
    """Load a NIfTI CT volume and normalise to [0, 1].

    Detects whether the data is raw HU values or already preprocessed
    (values in [0, 1]) and only applies windowing to raw HU data.
    """
    import nibabel as nib

    nii = nib.load(str(path))
    data = np.asarray(nii.dataobj, dtype=np.float32)

    # Detect if already preprocessed: raw HU typically has values < -200 or > 100
    data_min, data_max = float(data.min()), float(data.max())
    if data_min >= -0.01 and data_max <= 1.01:
        # Already normalised to [0, 1] — skip HU windowing
        data = np.clip(data, 0.0, 1.0)
    else:
        # Raw HU values — apply bone window [-200, 1500]
        hu_min, hu_max = -200.0, 1500.0
        data = np.clip(data, hu_min, hu_max)
        data = (data - hu_min) / (hu_max - hu_min)

    # Resize to target cubic resolution
    data = _resize_volume(data, target_size)
    return data


def _resize_volume(volume: np.ndarray, target: int) -> np.ndarray:
    """Resize a 3D volume to (target, target, target) using trilinear interpolation."""
    tensor = torch.from_numpy(volume).float().unsqueeze(0).unsqueeze(0)
    resized = torch.nn.functional.interpolate(
        tensor, size=(target, target, target), mode="trilinear", align_corners=True
    )
    return resized.squeeze(0).squeeze(0).numpy()


# ── Synthetic bone generation ────────────────────────────────────────


def generate_synthetic_bone(
    resolution: int = 64,
    shape_type: str = "random",
    seed: Optional[int] = None,
) -> np.ndarray:
    """Generate a procedural bone-like volume for training bootstrap.

    Creates realistic-ish shapes by combining ellipsoids, cylinders, and
    noise to approximate long bones, vertebrae, or pelvis fragments.
    """
    rng = np.random.RandomState(seed)
    volume = np.zeros((resolution, resolution, resolution), dtype=np.float32)

    coords = np.linspace(-1, 1, resolution)
    xx, yy, zz = np.meshgrid(coords, coords, coords, indexing="ij")

    if shape_type == "random":
        shape_type = rng.choice(["long_bone", "vertebra", "pelvis_fragment"])

    if shape_type == "long_bone":
        # Elongated ellipsoid (femur/tibia-like)
        a = 0.15 + rng.random() * 0.1
        b = 0.15 + rng.random() * 0.1
        c = 0.55 + rng.random() * 0.2
        cx, cy, cz = rng.uniform(-0.1, 0.1, 3)
        dist = ((xx - cx) / a) ** 2 + ((yy - cy) / b) ** 2 + ((zz - cz) / c) ** 2
        volume = np.clip(1.0 - dist, 0, 1)

        # Add epiphysis bumps at ends
        for end_z in [cz - c * 0.8, cz + c * 0.8]:
            r = 0.2 + rng.random() * 0.08
            bump = ((xx - cx) ** 2 + (yy - cy) ** 2 + (zz - end_z) ** 2) / (r ** 2)
            volume = np.maximum(volume, np.clip(1.0 - bump, 0, 1) * 0.85)

    elif shape_type == "vertebra":
        # Cylindrical body + spinous process
        r_body = 0.25 + rng.random() * 0.1
        h_body = 0.2 + rng.random() * 0.1
        body = ((xx ** 2 + yy ** 2) / r_body ** 2 + (zz / h_body) ** 2)
        volume = np.clip(1.0 - body, 0, 1) * 0.9

        # Spinous process
        spine_mask = (np.abs(xx) < 0.06) & (yy > 0.1) & (yy < 0.5) & (np.abs(zz) < h_body)
        volume[spine_mask] = np.maximum(volume[spine_mask], 0.7)

    elif shape_type == "pelvis_fragment":
        # Curved shell
        r_outer = 0.6 + rng.random() * 0.15
        r_inner = r_outer - 0.08 - rng.random() * 0.06
        dist = np.sqrt(xx ** 2 + yy ** 2 + zz ** 2)
        shell = ((dist > r_inner) & (dist < r_outer)).astype(np.float32)
        # Clip to hemisphere
        shell[zz < -0.1] = 0
        shell[yy < -0.3] = 0
        volume = shell * (0.7 + 0.3 * rng.random())

    # Add subtle noise for realism
    noise = rng.randn(*volume.shape).astype(np.float32) * 0.03
    volume = np.clip(volume + noise, 0, 1)

    # Threshold to create sharper bone boundary
    volume = np.where(volume > 0.15, volume, 0.0)

    return volume


# ── Occupancy sampling ───────────────────────────────────────────────


def sample_occupancy_points(
    volume: np.ndarray,
    n_points: int = 4096,
    surface_ratio: float = 0.5,
    threshold: float = 0.3,
    rng: Optional[np.random.RandomState] = None,
    balanced: bool = True,
) -> tuple[np.ndarray, np.ndarray]:
    """Sample 3D points and their occupancy labels from a volume.

    When balanced=True (default), ensures ~50% positive and ~50% negative
    labels to prevent the model from learning to predict all-zeros on
    sparse volumes (real CT data is typically only 1-3% bone).

    Returns:
        points: (n_points, 3) float32 in [-1, 1]
        labels: (n_points,) float32, 1.0 = inside bone, 0.0 = outside
    """
    if rng is None:
        rng = np.random.RandomState()

    resolution = volume.shape[0]
    binary = (volume > threshold).astype(np.float32)

    occupied = np.argwhere(binary > 0.5)
    empty = np.argwhere(binary < 0.5)

    if balanced and len(occupied) > 0 and len(empty) > 0:
        # Balanced sampling: half positive, half negative
        n_pos = n_points // 2
        n_neg = n_points - n_pos

        # Positive points: bone voxels + jitter
        pos_idx = rng.choice(len(occupied), size=n_pos, replace=True)
        pos_voxels = occupied[pos_idx].astype(np.float32)
        pos_pts = pos_voxels / (resolution - 1) * 2 - 1
        # Small jitter to stay mostly inside bone
        pos_pts += rng.randn(n_pos, 3).astype(np.float32) * (1.0 / resolution)
        pos_pts = np.clip(pos_pts, -1, 1)

        # Negative points: mix of near-surface negatives and uniform
        n_near = n_neg // 2
        n_far = n_neg - n_near

        # Near-surface negatives (just outside bone boundary)
        near_idx = rng.choice(len(occupied), size=n_near, replace=True)
        near_voxels = occupied[near_idx].astype(np.float32)
        near_pts = near_voxels / (resolution - 1) * 2 - 1
        # Larger jitter to push outside bone
        near_pts += rng.randn(n_near, 3).astype(np.float32) * (4.0 / resolution)
        near_pts = np.clip(near_pts, -1, 1)

        # Far negatives (uniform random, mostly empty space)
        far_pts = rng.uniform(-1, 1, (n_far, 3)).astype(np.float32)

        neg_pts = np.concatenate([near_pts, far_pts], axis=0)

        # Look up actual labels for all points
        all_pts = np.concatenate([pos_pts, neg_pts], axis=0)
        all_voxels = ((all_pts + 1) / 2 * (resolution - 1)).astype(np.int32)
        all_voxels = np.clip(all_voxels, 0, resolution - 1)
        all_labels = binary[all_voxels[:, 0], all_voxels[:, 1], all_voxels[:, 2]]

        perm = rng.permutation(len(all_pts))
        return all_pts[perm], all_labels[perm]

    # Fallback: original surface-biased sampling
    n_surface = int(n_points * surface_ratio)
    n_uniform = n_points - n_surface

    points_list = []
    labels_list = []

    if n_uniform > 0:
        uniform_pts = rng.uniform(-1, 1, (n_uniform, 3)).astype(np.float32)
        uniform_voxels = ((uniform_pts + 1) / 2 * (resolution - 1)).astype(np.int32)
        uniform_voxels = np.clip(uniform_voxels, 0, resolution - 1)
        uniform_labels = binary[
            uniform_voxels[:, 0], uniform_voxels[:, 1], uniform_voxels[:, 2]
        ]
        points_list.append(uniform_pts)
        labels_list.append(uniform_labels)

    if n_surface > 0 and len(occupied) > 0:
        indices = rng.choice(len(occupied), size=n_surface, replace=True)
        chosen = occupied[indices].astype(np.float32)
        chosen_norm = chosen / (resolution - 1) * 2 - 1
        noise = rng.randn(n_surface, 3).astype(np.float32) * (2.0 / resolution * 3)
        surface_pts = np.clip(chosen_norm + noise, -1, 1)
        surface_voxels = ((surface_pts + 1) / 2 * (resolution - 1)).astype(np.int32)
        surface_voxels = np.clip(surface_voxels, 0, resolution - 1)
        surface_labels = binary[
            surface_voxels[:, 0], surface_voxels[:, 1], surface_voxels[:, 2]
        ]
        points_list.append(surface_pts)
        labels_list.append(surface_labels)
    elif n_surface > 0:
        extra = rng.uniform(-1, 1, (n_surface, 3)).astype(np.float32)
        points_list.append(extra)
        labels_list.append(np.zeros(n_surface, dtype=np.float32))

    points = np.concatenate(points_list, axis=0)
    labels = np.concatenate(labels_list, axis=0)
    perm = rng.permutation(len(points))
    return points[perm], labels[perm]


# ── PyTorch Dataset ──────────────────────────────────────────────────


class BoneReconstructionDataset(Dataset):
    """Dataset for training the XRayTo3DNet model.

    Can operate in two modes:
        1. nifti_dir mode — loads real CT volumes from a directory
        2. synthetic mode — generates procedural bones on-the-fly

    Each __getitem__ returns:
        - views: dict of {view_name: (1, H, W) tensor}
        - points: (n_points, 3) tensor
        - labels: (n_points,) tensor
    """

    def __init__(
        self,
        nifti_dir: Optional[str | Path] = None,
        n_synthetic: int = 500,
        volume_resolution: int = 64,
        image_resolution: int = 128,
        n_points: int = 4096,
        views: list[str] | None = None,
        augment: bool = True,
        bone_threshold: float = 0.15,
    ) -> None:
        self.volume_resolution = volume_resolution
        self.image_resolution = image_resolution
        self.n_points = n_points
        self.views = views or ["ap", "lateral", "oblique"]
        self.augment = augment
        self.bone_threshold = bone_threshold

        self.volumes: list[np.ndarray] = []

        if nifti_dir is not None:
            nifti_path = Path(nifti_dir)
            nifti_files = sorted(
                list(nifti_path.glob("*.nii")) + list(nifti_path.glob("*.nii.gz"))
            )
            for f in nifti_files:
                try:
                    vol = load_nifti_volume(f, target_size=volume_resolution)
                    self.volumes.append(vol)
                    logger.info("Loaded %s (%s)", f.name, vol.shape)
                except Exception as e:
                    logger.warning("Skipping %s: %s", f.name, e)
            logger.info("Loaded %d NIfTI volumes", len(self.volumes))

        # Add synthetic volumes to reach n_synthetic total
        n_needed = max(0, n_synthetic - len(self.volumes))
        if n_needed > 0:
            logger.info("Generating %d synthetic bone volumes...", n_needed)
            for i in range(n_needed):
                vol = generate_synthetic_bone(volume_resolution, "random", seed=i)
                self.volumes.append(vol)

        logger.info("Dataset ready: %d volumes total", len(self.volumes))

    def __len__(self) -> int:
        return len(self.volumes)

    def __getitem__(self, idx: int) -> dict:
        volume = self.volumes[idx].copy()

        # Data augmentation
        if self.augment:
            rng = np.random.RandomState()
            # Random axis flip
            for axis in range(3):
                if rng.random() > 0.5:
                    volume = np.flip(volume, axis=axis).copy()
            # Random intensity scaling
            scale = 0.85 + rng.random() * 0.3
            volume = np.clip(volume * scale, 0, 1)

        # Generate synthetic X-rays
        drr_images = generate_drr_set(volume, self.views, self.image_resolution, invert=True)

        # Convert X-rays to tensors (1, H, W)
        view_tensors = {}
        for vname, img in drr_images.items():
            view_tensors[vname] = torch.from_numpy(img).float().unsqueeze(0)

        # Sample occupancy points with balanced sampling
        points, labels = sample_occupancy_points(
            volume, self.n_points, surface_ratio=0.5,
            threshold=self.bone_threshold, balanced=True,
        )

        return {
            "views": view_tensors,
            "points": torch.from_numpy(points).float(),
            "labels": torch.from_numpy(labels).float(),
            "volume": torch.from_numpy(volume).float(),
        }


def collate_bone_batch(batch: list[dict]) -> dict:
    """Custom collate function for BoneReconstructionDataset."""
    views = {}
    for view_name in batch[0]["views"]:
        views[view_name] = torch.stack([b["views"][view_name] for b in batch])

    return {
        "views": views,
        "points": torch.stack([b["points"] for b in batch]),
        "labels": torch.stack([b["labels"] for b in batch]),
        "volume": torch.stack([b["volume"] for b in batch]),
    }
