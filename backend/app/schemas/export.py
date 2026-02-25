from pydantic import BaseModel, ConfigDict


class ExportRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_id: int
    format: str


class ExportResponse(BaseModel):
    download_url: str
    format: str
