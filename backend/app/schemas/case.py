from pydantic import BaseModel
from app.schemas.common import Timestamped


class CaseCreate(BaseModel):
    title: str
    patient_id: str | None = None


class CaseRead(Timestamped):
    id: int
    title: str
    patient_id: str | None = None
    status: str
