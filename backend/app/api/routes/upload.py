from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db import models
from app.schemas.upload import UploadResponse, UploadValidation
from app.storage.local import save_upload
from app.services.audit import log_event

router = APIRouter(prefix="/upload", tags=["upload"])


def _validate_file(file: UploadFile, size: int) -> UploadValidation:
    issues: list[str] = []
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        issues.append("Unsupported file type (use an image file)")
    quality_score = 0.9 if size > 20000 else 0.6
    if quality_score < 0.7:
        issues.append("Low resolution or noisy image")
    return UploadValidation(
        view=file.filename or "unknown",
        quality_score=quality_score,
        is_valid=content_type.startswith("image/"),
        issues=issues,
    )

def _get_test_user(db: Session) -> models.User:
    user = db.query(models.User).filter(models.User.email == "test@orthogenesis.ai").first()
    if user:
        return user
    user = models.User(
        email="test@orthogenesis.ai",
        full_name="Test User",
        role="admin",
        hashed_password="test-mode-password",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/xrays", response_model=UploadResponse)
async def upload_xrays(
    title: str = Form("Test Case"),
    patient_id: str | None = Form(None),
    views: str | None = Form(None),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    if len(files) != 1:
        raise HTTPException(status_code=400, detail="Upload exactly one image for test mode")

    view_list = [v.strip().lower() for v in views.split(",") if v.strip()] if views else ["single"]

    user = _get_test_user(db)
    case = models.Case(title=title, patient_id=patient_id, owner_id=user.id)
    db.add(case)
    db.commit()
    db.refresh(case)

    for file, view in zip(files, view_list, strict=False):
        content = await file.read()
        validation = _validate_file(file, len(content))
        if not validation.is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid {view} image")
        key = save_upload(content, file.filename or "xray.png")
        xray = models.XRayImage(case_id=case.id, view=view, file_key=key, quality_score=validation.quality_score)
        db.add(xray)

    db.commit()
    log_event(db, user.id, "upload", f"case:{case.id}", f"{len(files)} images uploaded")
    return UploadResponse(case_id=case.id, received=len(files), required_views=view_list)
