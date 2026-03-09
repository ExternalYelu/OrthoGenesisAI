"""Differentiable DRR Projector
================================

Generates synthetic X-ray images from CT volumes by simulating
orthographic X-ray projection (ray-sum through the volume).

Used for:
    1. Generating training data from public CT datasets
    2. Differentiable rendering during training (optional self-supervision)

Supports AP (front), lateral (side), and oblique (45°) projections.
"""

from __future__ import annotations

import io
from typing import Literal

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image


ViewName = Literal["ap", "lateral", "oblique"]

# Projection configs: axis to sum along (for axis-aligned views)
# and rotation angles for oblique views
PROJECTION_CONFIG = {
    "ap": {"axis": 2, "azimuth": 0.0, "elevation": 0.0},
    "lateral": {"axis": 0, "azimuth": 90.0, "elevation": 0.0},
    "oblique": {"axis": None, "azimuth": 45.0, "elevation": 15.0},
}


def project_volume(
    volume: torch.Tensor | np.ndarray,
    view: ViewName,
    output_size: int = 128,
    invert: bool = True,
) -> np.ndarray:
    """Project a 3D volume into a 2D X-ray-like image.

    Args:
        volume: 3D density volume (D, H, W), values in [0, 1] range
        view: Projection view name
        output_size: Output image resolution (square)
        invert: If True, invert so bone appears bright (standard X-ray convention)

    Returns:
        2D image as float32 numpy array in [0, 1], shape (output_size, output_size)
    """
    if isinstance(volume, np.ndarray):
        volume = torch.from_numpy(volume).float()

    config = PROJECTION_CONFIG[view]

    if config["axis"] is not None:
        # Axis-aligned projection: sum along the specified axis
        projection = volume.sum(dim=config["axis"])
    else:
        # Oblique: rotate the volume, then sum along Z
        projection = _oblique_projection(volume, config["azimuth"], config["elevation"])

    # Normalise to [0, 1]
    pmin, pmax = projection.min(), projection.max()
    if pmax - pmin > 1e-8:
        projection = (projection - pmin) / (pmax - pmin)
    else:
        projection = torch.zeros_like(projection)

    if invert:
        projection = 1.0 - projection

    # Resize to target output size
    proj_np = projection.cpu().numpy()
    img = Image.fromarray((proj_np * 255).astype(np.uint8))
    img = img.resize((output_size, output_size), Image.BILINEAR)
    return np.array(img, dtype=np.float32) / 255.0


def project_volume_tensor(
    volume: torch.Tensor,
    view: ViewName,
) -> torch.Tensor:
    """Differentiable projection returning a torch tensor (for training losses).

    Args:
        volume: (D, H, W) or (B, D, H, W) float tensor
        view: Projection view name

    Returns:
        2D projection tensor, normalised to [0, 1]
    """
    config = PROJECTION_CONFIG[view]

    if volume.dim() == 4:
        # Batch mode
        if config["axis"] is not None:
            proj = volume.sum(dim=config["axis"] + 1)  # +1 for batch dim
        else:
            proj = torch.stack([
                _oblique_projection(volume[i], config["azimuth"], config["elevation"])
                for i in range(volume.shape[0])
            ])
    else:
        if config["axis"] is not None:
            proj = volume.sum(dim=config["axis"])
        else:
            proj = _oblique_projection(volume, config["azimuth"], config["elevation"])

    # Normalise per-sample (avoid in-place for autograd)
    if proj.dim() == 3:
        pmin = proj.amin(dim=(-2, -1), keepdim=True)
        pmax = proj.amax(dim=(-2, -1), keepdim=True)
        denom = (pmax - pmin).clamp(min=1e-8)
        proj = (proj - pmin) / denom
    else:
        pmin, pmax = proj.min(), proj.max()
        if pmax - pmin > 1e-8:
            proj = (proj - pmin) / (pmax - pmin)

    return proj


def _oblique_projection(
    volume: torch.Tensor,
    azimuth_deg: float,
    elevation_deg: float,
) -> torch.Tensor:
    """Rotate volume and project along Z axis."""
    N = volume.shape[0]
    dtype, device = volume.dtype, volume.device

    az = torch.tensor(np.radians(azimuth_deg), dtype=dtype, device=device)
    el = torch.tensor(np.radians(elevation_deg), dtype=dtype, device=device)
    ca, sa = torch.cos(az), torch.sin(az)
    ce, se = torch.cos(el), torch.sin(el)

    rot = torch.tensor(
        [[ca, sa * se, sa * ce],
         [0, ce, -se],
         [-sa, ca * se, ca * ce]],
        dtype=dtype, device=device,
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


def generate_drr_set(
    volume: np.ndarray,
    views: list[ViewName] | None = None,
    output_size: int = 128,
    invert: bool = True,
) -> dict[str, np.ndarray]:
    """Generate a complete set of DRR projections from a CT volume.

    Args:
        volume: 3D numpy array, typically from a CT scan (HU values or normalised)
        views: List of view names to generate. Defaults to all three.
        output_size: Output image resolution

    Returns:
        Dict mapping view name to 2D float32 arrays in [0, 1]
    """
    if views is None:
        views = ["ap", "lateral", "oblique"]

    result = {}
    vol_tensor = torch.from_numpy(volume).float()
    for view in views:
        result[view] = project_volume(vol_tensor, view, output_size, invert)
    return result


def drr_to_bytes(image: np.ndarray) -> bytes:
    """Convert a DRR projection (float [0,1]) to PNG bytes."""
    img = Image.fromarray((image * 255).astype(np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
