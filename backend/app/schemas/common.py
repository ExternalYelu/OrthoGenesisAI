from datetime import datetime
from pydantic import BaseModel


class BaseSchema(BaseModel):
    class Config:
        from_attributes = True


class Timestamped(BaseSchema):
    created_at: datetime
