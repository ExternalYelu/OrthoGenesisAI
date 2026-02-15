from __future__ import annotations

from io import BytesIO

import trimesh


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

    mesh = trimesh.load(BytesIO(data), file_type=input_format)

    if output_format == "gltf":
        output_format = "glb"

    exported = mesh.export(file_type=output_format)
    if isinstance(exported, str):
        return exported.encode("utf-8")
    return exported
