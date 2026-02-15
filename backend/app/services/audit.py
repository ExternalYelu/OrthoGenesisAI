from sqlalchemy.orm import Session

from app.db import models


def log_event(db: Session, user_id: int, action: str, resource: str, details: str | None = None) -> None:
    entry = models.AuditLog(
        user_id=user_id,
        action=action,
        resource=resource,
        details=details,
    )
    db.add(entry)
    db.commit()
