from __future__ import annotations

from io import BytesIO

import trimesh


def _as_mesh(loaded: trimesh.Trimesh | trimesh.Scene) -> trimesh.Trimesh:
    if isinstance(loaded, trimesh.Trimesh):
        return loaded
    if isinstance(loaded, trimesh.Scene):
        geometries = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not geometries:
            raise ValueError("No mesh geometry found in input data")
        return trimesh.util.concatenate(geometries)
    raise ValueError("Unsupported mesh payload")


def _clean_for_export(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    cleaned = mesh.copy()
    components = cleaned.split(only_watertight=False)
    if len(components) > 1:
        cleaned = max(components, key=lambda m: float(m.area))

    cleaned.remove_unreferenced_vertices()
    try:
        cleaned.merge_vertices()
    except Exception:
        pass
    try:
        cleaned.fill_holes()
    except Exception:
        pass
    return cleaned


def convert_mesh(data: bytes, input_format: str, output_format: str) -> bytes:
    """
    Convert mesh data between formats using trimesh.

    input_format: obj|stl|gltf|glb
    output_format: obj|stl|gltf|glb
    """
    input_format = input_format.lower()
    output_format = output_format.lower()

    if input_format == "gltf":
        input_format = "glb"

    loaded = trimesh.load(BytesIO(data), file_type=input_format)
    mesh = _clean_for_export(_as_mesh(loaded))

    if output_format == "gltf":
        output_format = "glb"

    exported = mesh.export(file_type=output_format)
    if isinstance(exported, str):
        return exported.encode("utf-8")
    return exported
