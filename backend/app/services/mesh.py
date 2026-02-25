from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

import numpy as np
import trimesh


@dataclass(frozen=True)
class MeshQualityProfile:
    name: str
    target_ratio: float
    taubin_iterations: int
    scale_mode: str


QUALITY_PROFILES: dict[str, MeshQualityProfile] = {
    "draft": MeshQualityProfile("draft", target_ratio=0.5, taubin_iterations=2, scale_mode="conservative"),
    "clinical": MeshQualityProfile(
        "clinical", target_ratio=0.75, taubin_iterations=4, scale_mode="conservative"
    ),
    "print": MeshQualityProfile("print", target_ratio=0.85, taubin_iterations=6, scale_mode="print_mm"),
}


def _as_mesh(loaded: trimesh.Trimesh | trimesh.Scene) -> trimesh.Trimesh:
    if isinstance(loaded, trimesh.Trimesh):
        return loaded
    if isinstance(loaded, trimesh.Scene):
        geometries = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not geometries:
            raise ValueError("No mesh geometry found in input data")
        return trimesh.util.concatenate(geometries)
    raise ValueError("Unsupported mesh payload")


def _repair_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    repaired = mesh.copy()
    repaired.remove_unreferenced_vertices()
    try:
        repaired.remove_degenerate_faces()
    except Exception:
        pass
    try:
        repaired.remove_duplicate_faces()
    except Exception:
        pass
    try:
        repaired.merge_vertices()
    except Exception:
        pass
    try:
        repaired.fill_holes()
    except Exception:
        pass
    return repaired


def _largest_component(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    components = mesh.split(only_watertight=False)
    if len(components) <= 1:
        return mesh
    return max(components, key=lambda part: float(part.area))


def _decimate(mesh: trimesh.Trimesh, ratio: float) -> trimesh.Trimesh:
    if ratio >= 0.999:
        return mesh
    target_faces = max(128, int(len(mesh.faces) * ratio))
    if target_faces >= len(mesh.faces):
        return mesh
    try:
        decimated = mesh.simplify_quadratic_decimation(target_faces)
        if isinstance(decimated, trimesh.Trimesh) and len(decimated.faces) > 0:
            return decimated
    except Exception:
        pass
    return mesh


def _smooth_taubin(mesh: trimesh.Trimesh, iterations: int) -> None:
    if iterations <= 0:
        return
    try:
        trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=iterations)
    except Exception:
        return


def _scale_units(mesh: trimesh.Trimesh, mode: str) -> None:
    """
    Heuristic unit normalization.
    - print_mm: attempt to convert to millimeters for slicer consistency.
    """
    extents = mesh.extents
    max_extent = float(np.max(extents)) if extents is not None and extents.size else 0.0
    if max_extent <= 0:
        return

    if mode == "print_mm":
        # If model appears in meter-scale, convert to millimeters.
        if max_extent < 5.0:
            mesh.apply_scale(100.0)
        # If model is absurdly large, gently down-scale.
        elif max_extent > 1000.0:
            mesh.apply_scale(0.1)
    else:
        # Conservative keeps original units except extreme outliers.
        if max_extent > 5000.0:
            mesh.apply_scale(0.1)


def convert_mesh(
    data: bytes,
    input_format: str,
    output_format: str,
    *,
    quality_profile: str = "clinical",
) -> bytes:
    """
    Convert and repair mesh data between formats using trimesh.

    input_format: obj|stl|gltf|glb
    output_format: obj|stl|gltf|glb
    quality_profile: draft|clinical|print
    """
    input_format = input_format.lower()
    output_format = output_format.lower()
    profile = QUALITY_PROFILES.get(quality_profile, QUALITY_PROFILES["clinical"])

    if input_format == "gltf":
        input_format = "glb"

    loaded = trimesh.load(BytesIO(data), file_type=input_format)
    mesh = _as_mesh(loaded)
    mesh = _largest_component(mesh)
    mesh = _repair_mesh(mesh)
    mesh = _decimate(mesh, profile.target_ratio)
    _smooth_taubin(mesh, profile.taubin_iterations)
    _scale_units(mesh, profile.scale_mode)
    mesh = _repair_mesh(mesh)

    if output_format == "gltf":
        output_format = "glb"

    exported = mesh.export(file_type=output_format)
    if isinstance(exported, str):
        return exported.encode("utf-8")
    return exported
