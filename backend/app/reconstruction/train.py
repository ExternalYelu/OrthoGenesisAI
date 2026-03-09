"""Training Script for XRayTo3DNet
===================================

Usage:
    # Train on synthetic data (no CT volumes needed):
    python -m app.reconstruction.train --epochs 50 --synthetic 500

    # Train on real NIfTI CT data:
    python -m app.reconstruction.train --nifti-dir /path/to/ct/volumes --epochs 100

    # Resume from checkpoint:
    python -m app.reconstruction.train --resume data/checkpoints/latest.pt --epochs 100

The trained model checkpoint is saved to data/checkpoints/ and can be loaded
by the ImplicitFieldModel for inference.
"""

from __future__ import annotations

import argparse
import logging
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, random_split

# Add project root to path for imports
PROJECT_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PROJECT_ROOT))

from app.reconstruction.neural_model import XRayTo3DNet
from app.reconstruction.data_pipeline import (
    BoneReconstructionDataset,
    collate_bone_batch,
)
from app.reconstruction.drr_projector import project_volume_tensor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Directories ──────────────────────────────────────────────────────

CHECKPOINT_DIR = PROJECT_ROOT / "data" / "checkpoints"
CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)


# ── Re-projection loss ──────────────────────────────────────────────


def reprojection_loss(
    model: XRayTo3DNet,
    views: dict[str, torch.Tensor],
    grid_res: int = 32,
) -> torch.Tensor:
    """Predict a low-res occupancy grid, project it, and compare to input X-rays.

    This loss forces the 3D prediction to be consistent with the input
    X-ray views when re-projected — a powerful geometric constraint.
    """
    fused = model.encode_views(views)

    # Build grid coordinates
    coords = torch.linspace(-1, 1, grid_res, device=fused.device)
    xx, yy, zz = torch.meshgrid(coords, coords, coords, indexing="ij")
    grid_points = torch.stack([xx, yy, zz], dim=-1).reshape(1, -1, 3)
    B = fused.shape[0]
    grid_points = grid_points.expand(B, -1, -1)

    # Predict occupancy
    logits = model.decoder(fused, grid_points)
    probs = torch.sigmoid(logits).reshape(B, grid_res, grid_res, grid_res)

    total_loss = torch.tensor(0.0, device=fused.device)
    n_views = 0

    for view_name, input_xray in views.items():
        # Project predicted volume → synthetic X-ray
        proj = project_volume_tensor(probs, view_name)  # (B, H_proj, W_proj)

        # Resize input X-ray to match projection size
        target = F.adaptive_avg_pool2d(input_xray, proj.shape[-2:]).squeeze(1)

        # Normalise both to [0, 1] (avoid in-place ops for autograd)
        proj_max = proj.detach().max()
        target_max = target.detach().max()
        proj_norm = proj / (proj_max + 1e-8)
        target_norm = target / (target_max + 1e-8)

        total_loss = total_loss + F.mse_loss(proj_norm, target_norm)
        n_views += 1

    return total_loss / max(n_views, 1)


# ── Training loop ────────────────────────────────────────────────────


def train(
    model: XRayTo3DNet,
    train_loader: DataLoader,
    val_loader: DataLoader | None,
    epochs: int,
    lr: float,
    device: torch.device,
    checkpoint_dir: Path,
    log_interval: int = 10,
    use_reproj_loss: bool = True,
    reproj_weight: float = 0.1,
    reproj_res: int = 32,
) -> dict:
    """Train the model with BCE loss + optional re-projection loss."""

    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=epochs, eta_min=lr * 0.01
    )

    best_val_loss = float("inf")
    history = {"train_loss": [], "val_loss": [], "val_iou": []}

    total_params = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    logger.info("Model: %d params (%d trainable)", total_params, trainable)
    logger.info(
        "Training for %d epochs, lr=%.6f, device=%s, reproj=%s (w=%.2f)",
        epochs, lr, device, use_reproj_loss, reproj_weight,
    )

    for epoch in range(1, epochs + 1):
        model.train()
        epoch_loss = 0.0
        n_batches = 0
        t0 = time.time()

        for batch_idx, batch in enumerate(train_loader):
            views = {k: v.to(device) for k, v in batch["views"].items()}
            points = batch["points"].to(device)
            labels = batch["labels"].to(device)

            # Forward pass — occupancy loss
            logits = model(views, points)
            occ_loss = F.binary_cross_entropy_with_logits(logits, labels)

            # Re-projection loss (every other batch to save compute)
            loss = occ_loss
            if use_reproj_loss and batch_idx % 2 == 0:
                rp_loss = reprojection_loss(model, views, grid_res=reproj_res)
                loss = occ_loss + reproj_weight * rp_loss

            # Backward
            optimizer.zero_grad()
            loss.backward()

            # Gradient clipping for stability
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

            optimizer.step()

            epoch_loss += loss.item()
            n_batches += 1

            if (batch_idx + 1) % log_interval == 0:
                logger.info(
                    "  Epoch %d [%d/%d] loss=%.5f",
                    epoch, batch_idx + 1, len(train_loader), loss.item(),
                )

        scheduler.step()
        avg_train_loss = epoch_loss / max(n_batches, 1)
        history["train_loss"].append(avg_train_loss)
        elapsed = time.time() - t0

        # Validation
        val_loss, val_iou = float("inf"), 0.0
        if val_loader is not None:
            val_loss, val_iou = validate(model, val_loader, device)
            history["val_loss"].append(val_loss)
            history["val_iou"].append(val_iou)

        logger.info(
            "Epoch %d/%d | train_loss=%.5f | val_loss=%.5f | val_iou=%.3f | lr=%.6f | %.1fs",
            epoch, epochs, avg_train_loss, val_loss, val_iou,
            scheduler.get_last_lr()[0], elapsed,
        )

        # Save checkpoint
        is_best = val_loss < best_val_loss
        if is_best:
            best_val_loss = val_loss

        save_checkpoint(
            model, optimizer, scheduler, epoch, avg_train_loss, val_loss,
            checkpoint_dir, is_best=is_best,
        )

    logger.info("Training complete. Best val_loss: %.5f", best_val_loss)
    return history


@torch.no_grad()
def validate(
    model: XRayTo3DNet,
    val_loader: DataLoader,
    device: torch.device,
) -> tuple[float, float]:
    """Compute validation loss and IoU."""
    model.eval()
    total_loss = 0.0
    total_iou_num = 0.0
    total_iou_den = 0.0
    n = 0

    for batch in val_loader:
        views = {k: v.to(device) for k, v in batch["views"].items()}
        points = batch["points"].to(device)
        labels = batch["labels"].to(device)

        logits = model(views, points)
        loss = F.binary_cross_entropy_with_logits(logits, labels)
        total_loss += loss.item()
        n += 1

        # IoU metric
        preds = (torch.sigmoid(logits) > 0.5).float()
        intersection = (preds * labels).sum()
        union = ((preds + labels) > 0.5).float().sum()
        total_iou_num += intersection.item()
        total_iou_den += union.item()

    avg_loss = total_loss / max(n, 1)
    iou = total_iou_num / max(total_iou_den, 1e-8)
    return avg_loss, iou


def save_checkpoint(
    model: XRayTo3DNet,
    optimizer: torch.optim.Optimizer,
    scheduler: torch.optim.lr_scheduler.LRScheduler,
    epoch: int,
    train_loss: float,
    val_loss: float,
    checkpoint_dir: Path,
    is_best: bool = False,
) -> None:
    state = {
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "scheduler_state_dict": scheduler.state_dict(),
        "train_loss": train_loss,
        "val_loss": val_loss,
        "model_config": {
            "feat_dim": model.encoder.feat_dim,
        },
    }

    # Always save latest
    latest_path = checkpoint_dir / "latest.pt"
    torch.save(state, latest_path)

    # Save periodic
    if epoch % 10 == 0:
        torch.save(state, checkpoint_dir / f"epoch_{epoch:04d}.pt")

    # Save best
    if is_best:
        torch.save(state, checkpoint_dir / "best.pt")
        logger.info("  → Saved best checkpoint (val_loss=%.5f)", val_loss)


def load_checkpoint(
    path: str | Path,
    device: torch.device,
) -> tuple[XRayTo3DNet, dict]:
    """Load a model from checkpoint."""
    state = torch.load(str(path), map_location=device, weights_only=False)
    config = state.get("model_config", {})
    feat_dim = config.get("feat_dim", 64)

    model = XRayTo3DNet(feat_dim=feat_dim)
    model.load_state_dict(state["model_state_dict"])
    model.to(device)
    return model, state


# ── CLI ──────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Train XRayTo3DNet")
    parser.add_argument("--nifti-dir", type=str, default=None, help="Directory with NIfTI CT volumes")
    parser.add_argument("--synthetic", type=int, default=500, help="Number of synthetic volumes")
    parser.add_argument("--epochs", type=int, default=50, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=4, help="Batch size (keep small for CPU)")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--feat-dim", type=int, default=64, help="Feature dimension")
    parser.add_argument("--volume-res", type=int, default=64, help="Volume resolution for training")
    parser.add_argument("--image-res", type=int, default=128, help="X-ray image resolution")
    parser.add_argument("--n-points", type=int, default=4096, help="Query points per sample")
    parser.add_argument("--val-split", type=float, default=0.1, help="Validation split ratio")
    parser.add_argument("--resume", type=str, default=None, help="Resume from checkpoint")
    parser.add_argument("--workers", type=int, default=0, help="DataLoader workers (0 for CPU)")
    args = parser.parse_args()

    device = torch.device("cpu")
    logger.info("Device: %s", device)

    # Build dataset
    logger.info("Building dataset...")
    dataset = BoneReconstructionDataset(
        nifti_dir=args.nifti_dir,
        n_synthetic=args.synthetic,
        volume_resolution=args.volume_res,
        image_resolution=args.image_res,
        n_points=args.n_points,
    )

    # Train/val split
    n_val = max(1, int(len(dataset) * args.val_split))
    n_train = len(dataset) - n_val
    train_set, val_set = random_split(dataset, [n_train, n_val])

    train_loader = DataLoader(
        train_set, batch_size=args.batch_size, shuffle=True,
        collate_fn=collate_bone_batch, num_workers=args.workers,
    )
    val_loader = DataLoader(
        val_set, batch_size=args.batch_size, shuffle=False,
        collate_fn=collate_bone_batch, num_workers=args.workers,
    )

    logger.info("Train: %d samples, Val: %d samples", n_train, n_val)

    # Build or load model
    if args.resume:
        logger.info("Resuming from %s", args.resume)
        model, state = load_checkpoint(args.resume, device)
        start_epoch = state["epoch"]
        logger.info("  Resumed at epoch %d", start_epoch)
    else:
        model = XRayTo3DNet(feat_dim=args.feat_dim)
        model.to(device)

    # Train
    history = train(
        model, train_loader, val_loader,
        epochs=args.epochs, lr=args.lr, device=device,
        checkpoint_dir=CHECKPOINT_DIR,
    )

    logger.info("Done. Checkpoints saved to %s", CHECKPOINT_DIR)


if __name__ == "__main__":
    main()
