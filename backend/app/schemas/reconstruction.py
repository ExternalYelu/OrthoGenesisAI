from pydantic import BaseModel
from app.schemas.common import Timestamped


class ReconstructionCreate(BaseModel):
    case_id: int


class ReconstructionStatus(Timestamped):
    id: int
    case_id: int
    status: str
    confidence: float
    version: int
    notes: str | None = None
    mesh_key: str | None = None
