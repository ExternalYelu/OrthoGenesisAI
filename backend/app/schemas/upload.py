from pydantic import BaseModel, Field


class UploadXRayFile(BaseModel):
    id: int
    view: str
    preview_url: str


class UploadResponse(BaseModel):
    case_id: int
    received: int
    required_views: list[str]
    study_id: int | None = None
    render_mode: str = "3d"
    xrays: list[UploadXRayFile] = Field(default_factory=list)


class UploadValidation(BaseModel):
    view: str
    quality_score: float
    is_valid: bool
    issues: list[str]
