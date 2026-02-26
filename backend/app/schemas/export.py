from pydantic import BaseModel, ConfigDict, Field


class ExportRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_id: int
    format: str


class ExportResponse(BaseModel):
    download_url: str
    format: str


class ExportBundleRequest(BaseModel):
    formats: list[str] = Field(default_factory=lambda: ["stl", "obj", "gltf"])
    preset: str = "print"
    units: str = "mm"
    tolerance_mm: float = 0.25


class ExportBundleResponse(BaseModel):
    download_url: str
    manifest: dict
