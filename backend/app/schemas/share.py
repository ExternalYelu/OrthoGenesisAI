from datetime import datetime
from pydantic import BaseModel


class ShareLinkResponse(BaseModel):
    token: str
    expires_at: datetime
