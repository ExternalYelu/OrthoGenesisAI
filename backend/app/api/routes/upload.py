from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_role
from app.db import models
from app.schemas.upload import UploadResponse, UploadValidation
from app.storage.s3 import upload_file
from app.services.audit import log_event

router = APIRouter(prefix="/upload", tags=["upload"])

REQUIRED_VIEWS = ["ap", "lateral", "oblique"]


def _validate_file(file: UploadFile, size: int) -> UploadValidation:
    issues: list[str] = []
    if file.content_type not in {"image/png", "image/jpeg", "application/dicom"}:
        issues.append("Unsupported file type")
    quality_score = 0.9 if size > 20000 else 0.6
    if quality_score < 0.7:
        issues.append("Low resolution or noisy image")
    return UploadValidation(
        view=file.filename or "unknown",
        quality_score=quality_score,
        is_valid=len(issues) == 0,
        issues=issues,
    )


@router.post("/xrays", response_model=UploadResponse)
async def upload_xrays(
    title: str = Form(...),
    patient_id: str | None = Form(None),
    views: str = Form(...),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_role(["doctor", "admin"])),
):
    view_list = [v.strip().lower() for v in views.split(",") if v.strip()]
    if not all(view in view_list for view in REQUIRED_VIEWS):
        raise HTTPException(status_code=400, detail="Missing required views")
    if len(files) != len(view_list):
        raise HTTPException(status_code=400, detail="Each view requires a file")

    case = models.Case(title=title, patient_id=patient_id, owner_id=user.id)
    db.add(case)
    db.commit()
    db.refresh(case)

    for file, view in zip(files, view_list, strict=False):
        content = await file.read()
        validation = _validate_file(file, len(content))
        if not validation.is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid {view} image")
        key = upload_file(file_obj=BytesIO(content), content_type=file.content_type or "image/png", prefix="xrays")
        xray = models.XRayImage(case_id=case.id, view=view, file_key=key, quality_score=validation.quality_score)
        db.add(xray)

    db.commit()
    log_event(db, user.id, "upload", f"case:{case.id}", f"{len(files)} images uploaded")
    return UploadResponse(case_id=case.id, received=len(files), required_views=REQUIRED_VIEWS)

