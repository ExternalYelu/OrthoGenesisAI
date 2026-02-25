from pydantic import BaseModel, ConfigDict
from app.schemas.common import Timestamped


class ReconstructionCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    case_id: int
    model_name: str | None = None
    seed: int | None = None


class ReconstructionStatus(Timestamped):
    id: int
    case_id: int
    status: str
    confidence: float
    version: int
    notes: str | None = None
    mesh_key: str | None = None
    input_set_hash: str | None = None
    pipeline_version: str | None = None
    confidence_version: str | None = None
    uncertainty_map_key: str | None = None
