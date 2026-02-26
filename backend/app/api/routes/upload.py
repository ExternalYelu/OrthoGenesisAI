from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db import models
from app.schemas.upload import UploadResponse, UploadValidation
from app.services.dicom import ingest_dicom, is_dicom_upload
from app.storage.local import save_upload
from app.services.audit import log_event

router = APIRouter(prefix="/upload", tags=["upload"])


def _validate_file(file: UploadFile, size: int) -> UploadValidation:
    issues: list[str] = []
    content_type = file.content_type or ""
    is_dicom = "dicom" in content_type.lower() or (file.filename or "").lower().endswith(".dcm")
    is_image = content_type.startswith("image/")
    if not (is_image or is_dicom):
        issues.append("Unsupported file type (use image or DICOM)")
    quality_score = 0.9 if size > 20000 else 0.6
    if quality_score < 0.7:
        issues.append("Low resolution or noisy image")
    return UploadValidation(
        view=file.filename or "unknown",
        quality_score=quality_score,
        is_valid=(is_image or is_dicom),
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
    if len(files) < 1:
        raise HTTPException(status_code=400, detail="Upload at least one image")
    if len(files) > 6:
        raise HTTPException(status_code=400, detail="Upload up to 6 images per case")

    parsed_views = [v.strip().lower() for v in views.split(",") if v.strip()] if views else []
    view_list = parsed_views if parsed_views else ["single"] * len(files)

    user = _get_test_user(db)
    case = models.Case(title=title, patient_id=patient_id, owner_id=user.id)
    db.add(case)
    db.commit()
    db.refresh(case)
    study: models.Study | None = None

    for index, file in enumerate(files):
        view = view_list[index] if index < len(view_list) else f"view-{index + 1}"
        content = await file.read()
        validation = _validate_file(file, len(content))
        if not validation.is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid {view} image")

        dicom_metadata = None
        series: models.Series | None = None
        payload_bytes = content
        payload_name = file.filename or "xray.png"
        resolved_view = view

        if is_dicom_upload(file.filename, file.content_type, content):
            dicom = ingest_dicom(content)
            payload_bytes = dicom.render_bytes
            payload_name = (file.filename or "xray.dcm").rsplit(".", 1)[0] + ".png"
            dicom_key = save_upload(dicom.deidentified_bytes, (file.filename or "xray.dcm"))

            if study is None:
                study = models.Study(
                    case_id=case.id,
                    study_instance_uid=dicom.study_instance_uid,
                    accession_number=dicom.accession_number,
                    modality=dicom.modality or "DX",
                    metadata_json=dicom.metadata,
                )
                db.add(study)
                db.commit()
                db.refresh(study)

            series = models.Series(
                study_id=study.id,
                series_instance_uid=dicom.series_instance_uid,
                body_part=dicom.body_part,
                view=dicom.view or view,
                orientation=dicom.orientation,
                spacing_x=dicom.spacing_x,
                spacing_y=dicom.spacing_y,
                metadata_json={"dicom_file_key": dicom_key, **dicom.metadata},
            )
            db.add(series)
            db.commit()
            db.refresh(series)

            dicom_metadata = dicom.metadata
            if dicom.view:
                resolved_view = dicom.view.lower()
        elif study is None:
            study = models.Study(
                case_id=case.id,
                modality="XR",
                metadata_json={"source": "image-upload"},
            )
            db.add(study)
            db.commit()
            db.refresh(study)

        if study is not None and series is None:
            series = models.Series(
                study_id=study.id,
                view=resolved_view,
                metadata_json={"source": "image-upload"},
            )
            db.add(series)
            db.commit()
            db.refresh(series)

        key = save_upload(payload_bytes, payload_name)
        xray = models.XRayImage(
            case_id=case.id,
            series_id=series.id if series else None,
            view=resolved_view,
            file_key=key,
            quality_score=validation.quality_score,
            metadata_json=dicom_metadata,
        )
        db.add(xray)

    db.commit()
    log_event(db, user.id, "upload", f"case:{case.id}", f"{len(files)} images uploaded")
    return UploadResponse(
        case_id=case.id,
        received=len(files),
        required_views=view_list,
        study_id=study.id if study else None,
    )


@router.delete("/case/{case_id}")
def soft_delete_case(case_id: int, db: Session = Depends(get_db)):
    case = db.query(models.Case).filter(models.Case.id == case_id, models.Case.deleted_at.is_(None)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    now = datetime.utcnow()
    case.deleted_at = now
    db.query(models.XRayImage).filter(
        models.XRayImage.case_id == case_id, models.XRayImage.deleted_at.is_(None)
    ).update({"deleted_at": now})
    db.query(models.Reconstruction).filter(
        models.Reconstruction.case_id == case_id, models.Reconstruction.deleted_at.is_(None)
    ).update({"deleted_at": now})
    db.commit()
    return {"status": "deleted", "case_id": case_id}
