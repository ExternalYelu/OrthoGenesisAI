from pydantic import BaseModel


class UploadResponse(BaseModel):
    case_id: int
    received: int
    required_views: list[str]


class UploadValidation(BaseModel):
    view: str
    quality_score: float
    is_valid: bool
    issues: list[str]
