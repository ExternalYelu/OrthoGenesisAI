"""Neural Implicit Field Model for 3D Bone Reconstruction
=========================================================

Architecture:
    1. ViewEncoder — ResNet-style CNN that encodes each X-ray into a feature map
    2. CrossAttentionFusion — Fuses multi-view features using view-aware cross-attention
    3. OccupancyDecoder — MLP that predicts occupancy probability at any 3D point
       given the fused feature vector

Designed for CPU training with small channel counts. Scale up channels and
resolution when GPU is available.
"""

from __future__ import annotations

import math
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


# ── View Encoder ──────────────────────────────────────────────────────


class ResBlock(nn.Module):
    """Simple pre-activation residual block."""

    def __init__(self, channels: int) -> None:
        super().__init__()
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        out = F.relu(self.bn1(x))
        out = self.conv1(out)
        out = F.relu(self.bn2(out))
        out = self.conv2(out)
        return out + residual


class ViewEncoder(nn.Module):
    """Encodes a single X-ray image into a spatial feature map.

    Input:  (B, 1, H, W)  — grayscale X-ray
    Output: (B, feat_dim, H/8, W/8)  — spatial feature map
    """

    def __init__(self, feat_dim: int = 64) -> None:
        super().__init__()
        self.feat_dim = feat_dim

        self.stem = nn.Sequential(
            nn.Conv2d(1, 32, 7, stride=2, padding=3, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, feat_dim, 3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(feat_dim),
            nn.ReLU(inplace=True),
        )

        self.blocks = nn.Sequential(
            ResBlock(feat_dim),
            ResBlock(feat_dim),
            nn.Conv2d(feat_dim, feat_dim, 3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(feat_dim),
            nn.ReLU(inplace=True),
            ResBlock(feat_dim),
            ResBlock(feat_dim),
        )

        # Global feature via adaptive pooling
        self.global_pool = nn.AdaptiveAvgPool2d(1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Returns (spatial_features, global_feature)."""
        feat = self.stem(x)
        feat = self.blocks(feat)
        glob = self.global_pool(feat).squeeze(-1).squeeze(-1)  # (B, feat_dim)
        return feat, glob


# ── View-aware positional encoding ───────────────────────────────────

# Each view gets a learned embedding so the model knows which angle it came from
VIEW_NAME_TO_IDX = {"ap": 0, "lateral": 1, "oblique": 2}
MAX_VIEWS = 3


class ViewEmbedding(nn.Module):
    """Learnable per-view embedding added to the global feature."""

    def __init__(self, feat_dim: int = 64) -> None:
        super().__init__()
        self.embeddings = nn.Embedding(MAX_VIEWS, feat_dim)

    def forward(self, global_feat: torch.Tensor, view_idx: int) -> torch.Tensor:
        emb = self.embeddings(torch.tensor(view_idx, device=global_feat.device))
        return global_feat + emb


# ── Cross-attention fusion ───────────────────────────────────────────


class CrossAttentionFusion(nn.Module):
    """Fuses global features from multiple views using multi-head attention.

    Input:  list of (B, feat_dim) global features from each view
    Output: (B, feat_dim) fused feature
    """

    def __init__(self, feat_dim: int = 64, n_heads: int = 4) -> None:
        super().__init__()
        self.attn = nn.MultiheadAttention(
            embed_dim=feat_dim, num_heads=n_heads, batch_first=True
        )
        self.norm = nn.LayerNorm(feat_dim)
        self.ffn = nn.Sequential(
            nn.Linear(feat_dim, feat_dim * 2),
            nn.GELU(),
            nn.Linear(feat_dim * 2, feat_dim),
        )
        self.norm2 = nn.LayerNorm(feat_dim)

    def forward(self, features: list[torch.Tensor]) -> torch.Tensor:
        # Stack views: (B, N_views, feat_dim)
        x = torch.stack(features, dim=1)

        # Self-attention across views
        attn_out, _ = self.attn(x, x, x)
        x = self.norm(x + attn_out)
        x = self.norm2(x + self.ffn(x))

        # Mean-pool across views
        return x.mean(dim=1)  # (B, feat_dim)


# ── 3D positional encoding ──────────────────────────────────────────


class FourierPositionalEncoding(nn.Module):
    """Encodes 3D coordinates with Fourier features for better spatial resolution."""

    def __init__(self, n_frequencies: int = 6) -> None:
        super().__init__()
        self.n_frequencies = n_frequencies
        # Output dim = 3 (raw xyz) + 3 * 2 * n_frequencies (sin/cos per axis)
        self.output_dim = 3 + 3 * 2 * n_frequencies

    def forward(self, coords: torch.Tensor) -> torch.Tensor:
        """coords: (B, N_points, 3) in [-1, 1]"""
        encoded = [coords]
        for i in range(self.n_frequencies):
            freq = 2.0 ** i * math.pi
            encoded.append(torch.sin(freq * coords))
            encoded.append(torch.cos(freq * coords))
        return torch.cat(encoded, dim=-1)


# ── Occupancy decoder ───────────────────────────────────────────────


class OccupancyDecoder(nn.Module):
    """Predicts occupancy at queried 3D points given a fused feature vector.

    Input:
        fused_feature: (B, feat_dim)
        points: (B, N_points, 3) — 3D query coordinates in [-1, 1]

    Output:
        occupancy: (B, N_points) — probability of being inside bone
    """

    def __init__(self, feat_dim: int = 64, n_frequencies: int = 6, hidden: int = 128) -> None:
        super().__init__()
        self.pos_enc = FourierPositionalEncoding(n_frequencies)
        point_dim = self.pos_enc.output_dim

        self.net = nn.Sequential(
            nn.Linear(point_dim + feat_dim, hidden),
            nn.ReLU(inplace=True),
            nn.Linear(hidden, hidden),
            nn.ReLU(inplace=True),
            nn.Linear(hidden, hidden),
            nn.ReLU(inplace=True),
            nn.Linear(hidden, hidden),
            nn.ReLU(inplace=True),
            nn.Linear(hidden, 1),
        )

    def forward(self, fused_feature: torch.Tensor, points: torch.Tensor) -> torch.Tensor:
        B, N, _ = points.shape

        # Positional encoding of query points
        pe = self.pos_enc(points)  # (B, N, point_dim)

        # Broadcast fused feature to every point
        feat = fused_feature.unsqueeze(1).expand(B, N, -1)  # (B, N, feat_dim)

        # Concatenate and predict
        x = torch.cat([pe, feat], dim=-1)  # (B, N, point_dim + feat_dim)
        return self.net(x).squeeze(-1)  # (B, N) — raw logits


# ── Full model ───────────────────────────────────────────────────────


class XRayTo3DNet(nn.Module):
    """Full pipeline: multi-view X-rays → occupancy field.

    Usage:
        model = XRayTo3DNet()
        # views: dict mapping view name to (B, 1, H, W) tensors
        # points: (B, N_points, 3) query coordinates in [-1, 1]
        logits = model(views, points)  # (B, N_points)
        probs = torch.sigmoid(logits)
    """

    def __init__(self, feat_dim: int = 64, n_heads: int = 4, n_frequencies: int = 6, hidden: int = 128) -> None:
        super().__init__()
        self.encoder = ViewEncoder(feat_dim)
        self.view_emb = ViewEmbedding(feat_dim)
        self.fusion = CrossAttentionFusion(feat_dim, n_heads)
        self.decoder = OccupancyDecoder(feat_dim, n_frequencies, hidden)

    def encode_views(self, views: dict[str, torch.Tensor]) -> torch.Tensor:
        """Encode and fuse multi-view X-rays into a single feature vector."""
        globals_list: list[torch.Tensor] = []
        for view_name, img in views.items():
            idx = VIEW_NAME_TO_IDX.get(view_name.lower(), 0)
            _, glob = self.encoder(img)
            glob = self.view_emb(glob, idx)
            globals_list.append(glob)
        return self.fusion(globals_list)

    def forward(self, views: dict[str, torch.Tensor], points: torch.Tensor) -> torch.Tensor:
        fused = self.encode_views(views)
        return self.decoder(fused, points)

    def predict_grid(self, views: dict[str, torch.Tensor], resolution: int = 64, chunk_size: int = 8192) -> torch.Tensor:
        """Predict occupancy on a full 3D grid. Returns (resolution, resolution, resolution) tensor."""
        self.eval()
        with torch.no_grad():
            fused = self.encode_views(views)

            # Build grid coordinates
            coords = torch.linspace(-1, 1, resolution)
            xx, yy, zz = torch.meshgrid(coords, coords, coords, indexing="ij")
            grid_points = torch.stack([xx, yy, zz], dim=-1).reshape(1, -1, 3)
            grid_points = grid_points.to(fused.device)

            # Predict in chunks to limit memory
            all_logits = []
            for i in range(0, grid_points.shape[1], chunk_size):
                chunk = grid_points[:, i : i + chunk_size]
                logits = self.decoder(fused, chunk)
                all_logits.append(logits)

            logits = torch.cat(all_logits, dim=1)
            probs = torch.sigmoid(logits)
            return probs.reshape(resolution, resolution, resolution)
