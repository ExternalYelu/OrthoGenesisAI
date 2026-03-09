#!/usr/bin/env python3
"""Download & Prepare CTpelvic1K Dataset
=========================================

This script handles downloading and preprocessing the CTpelvic1K dataset
for training the XRayTo3DNet neural reconstruction model.

CTpelvic1K contains 1,184 pelvic CT volumes from 7 sub-datasets.

Usage:
    # Step 1: Download (requires internet)
    python setup_ctpelvic1k.py download --output-dir data/ct_volumes

    # Step 2: Preprocess into training-ready NIfTI volumes
    python setup_ctpelvic1k.py preprocess --input-dir data/ct_volumes --output-dir data/ct_processed

    # Step 3: Verify the dataset
    python setup_ctpelvic1k.py verify --data-dir data/ct_processed

Manual download instructions (if automatic download fails):
    1. Go to: https://zenodo.org/record/4588403
    2. Download all .tar.gz files (annotations + CLINIC data)
    3. Extract into data/ct_volumes/
    4. For sub-datasets 1-5 (public), download from:
       - KITS19:  https://github.com/neheller/kits19
       - ABDOMEN: https://www.synapse.org/#!Synapse:syn3376386
       - COLONOG: https://wiki.cancerimagingarchive.net/display/Public/CT+COLONOGRAPHY
       - MSD_T10: https://drive.google.com/file/d/1m7tMpE9qEcQGQjL_BdMD-Mvgmc44hG1Y
       - CERVIX:  https://www.synapse.org/#!Synapse:syn3378972
    5. Run: python setup_ctpelvic1k.py preprocess
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_RAW_DIR = PROJECT_ROOT / "data" / "ct_volumes"
DEFAULT_PROCESSED_DIR = PROJECT_ROOT / "data" / "ct_processed"

ZENODO_RECORD = "4588403"
ZENODO_URL = f"https://zenodo.org/record/{ZENODO_RECORD}"

# Files available on Zenodo
ZENODO_FILES = [
    "CTPelvic1K_dataset6_data.tar.gz",      # CLINIC raw data (~2.5 GB)
    "CTPelvic1K_dataset7_data.tar.gz",      # CLINIC-metal raw data (~1.5 GB)
    "CTPelvic1K_dataset6_mask.tar.gz",      # CLINIC masks
    "CTPelvic1K_dataset7_mask.tar.gz",      # CLINIC-metal masks
    "CTPelvic1K_dataset1-5_mask_mappingback.tar.gz",  # Public dataset masks
]


def download_zenodo(output_dir: Path, files: list[str] | None = None) -> None:
    """Download CTpelvic1K files from Zenodo."""
    output_dir.mkdir(parents=True, exist_ok=True)
    files = files or ZENODO_FILES

    logger.info("Downloading from Zenodo record %s...", ZENODO_RECORD)
    logger.info("Target: %s", output_dir)

    for fname in files:
        url = f"https://zenodo.org/record/{ZENODO_RECORD}/files/{fname}"
        dest = output_dir / fname

        if dest.exists():
            logger.info("  %s already exists, skipping", fname)
            continue

        logger.info("  Downloading %s ...", fname)
        try:
            subprocess.run(
                ["curl", "-L", "-o", str(dest), url],
                check=True,
                capture_output=False,
            )
            logger.info("  ✓ Downloaded %s (%.1f MB)", fname, dest.stat().st_size / 1e6)
        except subprocess.CalledProcessError:
            logger.error("  ✗ Failed to download %s", fname)
            logger.error("    Download manually from: %s", ZENODO_URL)
            if dest.exists():
                dest.unlink()

    # Extract tar.gz files
    for fname in files:
        archive = output_dir / fname
        if archive.exists() and archive.suffix == ".gz":
            logger.info("  Extracting %s ...", fname)
            subprocess.run(["tar", "-xzf", str(archive), "-C", str(output_dir)], check=True)
            logger.info("  ✓ Extracted")


def preprocess_volumes(
    input_dir: Path,
    output_dir: Path,
    target_size: int = 128,
    bone_threshold_hu: float = 200.0,
) -> None:
    """Preprocess CT volumes into training-ready format.

    Steps:
    1. Find all NIfTI files in input_dir
    2. Apply bone window (HU: -200 to 1500)
    3. Resize to (target_size, target_size, target_size)
    4. Save as compressed NIfTI
    """
    import nibabel as nib
    import torch

    output_dir.mkdir(parents=True, exist_ok=True)

    nifti_files = sorted(
        list(input_dir.rglob("*.nii")) + list(input_dir.rglob("*.nii.gz"))
    )
    logger.info("Found %d NIfTI files in %s", len(nifti_files), input_dir)

    if not nifti_files:
        logger.error("No NIfTI files found! Check your download.")
        logger.error("Expected path: %s/**/*.nii.gz", input_dir)
        return

    processed = 0
    skipped = 0

    for i, nifti_path in enumerate(nifti_files):
        try:
            nii = nib.load(str(nifti_path))
            data = np.asarray(nii.dataobj, dtype=np.float32)

            # Skip if too small or not 3D
            if data.ndim != 3 or min(data.shape) < 20:
                logger.warning("  Skipping %s: shape=%s", nifti_path.name, data.shape)
                skipped += 1
                continue

            # Bone windowing: HU range [-200, 1500]
            hu_min, hu_max = -200.0, 1500.0
            data = np.clip(data, hu_min, hu_max)
            data = (data - hu_min) / (hu_max - hu_min)

            # Check if the volume actually contains bone
            bone_fraction = (data > 0.3).mean()
            if bone_fraction < 0.001:
                logger.warning("  Skipping %s: bone_fraction=%.4f (too sparse)", nifti_path.name, bone_fraction)
                skipped += 1
                continue

            # Resize to target resolution
            tensor = torch.from_numpy(data).float().unsqueeze(0).unsqueeze(0)
            resized = torch.nn.functional.interpolate(
                tensor, size=(target_size, target_size, target_size),
                mode="trilinear", align_corners=True,
            )
            processed_data = resized.squeeze().numpy()

            # Save as NIfTI
            out_name = f"vol_{processed:04d}.nii.gz"
            out_nii = nib.Nifti1Image(processed_data, affine=np.eye(4))
            nib.save(out_nii, str(output_dir / out_name))

            processed += 1
            if processed % 20 == 0:
                logger.info("  Processed %d/%d volumes...", processed, len(nifti_files))

        except Exception as e:
            logger.warning("  Error processing %s: %s", nifti_path.name, e)
            skipped += 1

    logger.info("Preprocessing complete: %d processed, %d skipped", processed, skipped)

    # Save dataset info
    info = {
        "total_files": len(nifti_files),
        "processed": processed,
        "skipped": skipped,
        "target_size": target_size,
        "bone_window_hu": [-200, 1500],
    }
    import json
    with open(output_dir / "dataset_info.json", "w") as f:
        json.dump(info, f, indent=2)
    logger.info("Dataset info saved to %s/dataset_info.json", output_dir)


def verify_dataset(data_dir: Path) -> None:
    """Verify processed dataset is ready for training."""
    import nibabel as nib

    nifti_files = sorted(list(data_dir.glob("*.nii.gz")))
    logger.info("Found %d processed volumes in %s", len(nifti_files), data_dir)

    if not nifti_files:
        logger.error("No processed volumes found!")
        return

    # Sample a few volumes
    n_check = min(5, len(nifti_files))
    for f in nifti_files[:n_check]:
        nii = nib.load(str(f))
        data = np.asarray(nii.dataobj, dtype=np.float32)
        bone_frac = (data > 0.3).mean()
        logger.info(
            "  %s: shape=%s, range=[%.3f, %.3f], bone=%.3f",
            f.name, data.shape, data.min(), data.max(), bone_frac,
        )

    logger.info("")
    logger.info("✓ Dataset ready for training!")
    logger.info("  Run: python -m app.reconstruction.train --nifti-dir %s --epochs 100", data_dir)


def generate_kits19_subset(output_dir: Path, n_cases: int = 50) -> None:
    """Provide instructions for KITS19 (easiest public subset to get)."""
    logger.info("=" * 60)
    logger.info("KITS19 Setup Instructions (Easiest Option)")
    logger.info("=" * 60)
    logger.info("")
    logger.info("KITS19 has 300 abdominal CTs. To download:")
    logger.info("")
    logger.info("  1. pip install kits19")
    logger.info("  2. python -c \"from kits19.starter_code.utils import get_case; \\")
    logger.info("     [get_case(i, '%s/kits19') for i in range(%d)]\"", output_dir, n_cases)
    logger.info("")
    logger.info("  OR clone the repo:")
    logger.info("  git clone https://github.com/neheller/kits19.git")
    logger.info("  cd kits19 && pip install -e .")
    logger.info("  python -m starter_code.get_imaging")
    logger.info("")
    logger.info("Then preprocess:")
    logger.info("  python setup_ctpelvic1k.py preprocess --input-dir kits19/data --output-dir %s", output_dir)


def main():
    parser = argparse.ArgumentParser(
        description="Download & Prepare CTpelvic1K Dataset",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command")

    # Download
    dl = sub.add_parser("download", help="Download from Zenodo")
    dl.add_argument("--output-dir", type=Path, default=DEFAULT_RAW_DIR)
    dl.add_argument("--masks-only", action="store_true", help="Only download mask files (smaller)")

    # Preprocess
    pp = sub.add_parser("preprocess", help="Preprocess NIfTI volumes")
    pp.add_argument("--input-dir", type=Path, default=DEFAULT_RAW_DIR)
    pp.add_argument("--output-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    pp.add_argument("--target-size", type=int, default=128)

    # Verify
    vr = sub.add_parser("verify", help="Verify processed dataset")
    vr.add_argument("--data-dir", type=Path, default=DEFAULT_PROCESSED_DIR)

    # KITS19 instructions
    kt = sub.add_parser("kits19", help="KITS19 download instructions")
    kt.add_argument("--output-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    kt.add_argument("--n-cases", type=int, default=50)

    args = parser.parse_args()

    if args.command == "download":
        files = [f for f in ZENODO_FILES if "mask" in f] if args.masks_only else None
        download_zenodo(args.output_dir, files)
    elif args.command == "preprocess":
        preprocess_volumes(args.input_dir, args.output_dir, args.target_size)
    elif args.command == "verify":
        verify_dataset(args.data_dir)
    elif args.command == "kits19":
        generate_kits19_subset(args.output_dir, args.n_cases)
    else:
        parser.print_help()
        print("\n\nQuick Start:")
        print("  python setup_ctpelvic1k.py download --output-dir data/ct_volumes")
        print("  python setup_ctpelvic1k.py preprocess")
        print("  python setup_ctpelvic1k.py verify")
        print("  python -m app.reconstruction.train --nifti-dir data/ct_processed --epochs 100")


if __name__ == "__main__":
    main()
