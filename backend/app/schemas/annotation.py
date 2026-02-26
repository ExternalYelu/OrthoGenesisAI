from datetime import datetime

from pydantic import BaseModel, Field


class AnnotationCommentCreate(BaseModel):
    author: str = Field(default="clinician", min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=5000)


class AnnotationCommentResponse(BaseModel):
    id: int
    author: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


class AnnotationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    severity: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    status: str = Field(default="open", pattern="^(open|in_review|resolved)$")
    anchor: tuple[float, float, float]
    comment: AnnotationCommentCreate | None = None


class AnnotationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    severity: str | None = Field(default=None, pattern="^(low|medium|high|critical)$")
    status: str | None = Field(default=None, pattern="^(open|in_review|resolved)$")


class AnnotationResponse(BaseModel):
    id: int
    reconstruction_id: int
    title: str
    severity: str
    status: str
    anchor: tuple[float, float, float]
    created_at: datetime
    updated_at: datetime
    comments: list[AnnotationCommentResponse]

