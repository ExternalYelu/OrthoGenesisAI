from datetime import datetime

from pydantic import BaseModel
from app.schemas.common import BaseSchema


class AsyncJobResponse(BaseSchema):
    id: str
    job_type: str
    status: str
    attempts: int
    max_attempts: int
    stage: str
    progress: int
    eta_seconds: int | None = None
    dead_letter: bool
    error: str | None = None
    result_json: dict | None = None
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None = None


class EnqueueResponse(BaseModel):
    job_id: str
    status: str
    resource_id: int | None = None
