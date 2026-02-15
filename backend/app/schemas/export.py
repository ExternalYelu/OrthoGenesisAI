from pydantic import BaseModel


class ExportRequest(BaseModel):
    model_id: int
    format: str


class ExportResponse(BaseModel):
    download_url: str
    format: str
