from __future__ import annotations

from datetime import datetime, timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db import models
from app.reconstruction.pipeline import ReconstructionPipeline
from app.reconstruction.engine import XRayInput
from app.schemas.reconstruction import ReconstructionCreate, ReconstructionStatus
from app.schemas.export import ExportResponse
from app.schemas.share import ShareLinkResponse
from app.storage.local import read_confidence_report, read_file, get_path, save_export
from app.services.audit import log_event
from app.services.mesh import convert_mesh

router = APIRouter(prefix="/reconstruct", tags=["reconstruct"])

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


@router.post("", response_model=ReconstructionStatus)
def reconstruct(payload: ReconstructionCreate, db: Session = Depends(get_db)):
    case = db.query(models.Case).filter(models.Case.id == payload.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    xrays = db.query(models.XRayImage).filter(models.XRayImage.case_id == case.id).all()
    if not xrays:
        raise HTTPException(status_code=400, detail="No X-rays found")

    reconstruction = models.Reconstruction(case_id=case.id, status="running")
    db.add(reconstruction)
    db.commit()
    db.refresh(reconstruction)

    pipeline = ReconstructionPipeline()
    inputs = []
    for xray in xrays:
        data = read_file(xray.file_key)
        inputs.append(XRayInput(view=xray.view, content_type="image/png", data=data))

    result, _ = pipeline.run(inputs)
    reconstruction.status = "complete"
    reconstruction.confidence = result.confidence
    reconstruction.mesh_key = result.mesh_key
    reconstruction.notes = result.notes
    db.commit()
    db.refresh(reconstruction)

    user = _get_test_user(db)
    log_event(db, user.id, "reconstruct", f"case:{case.id}", f"model:{reconstruction.id}")
    return ReconstructionStatus.model_validate(reconstruction)


@router.get("/model/{model_id}", response_model=ReconstructionStatus)
def get_model(model_id: int, db: Session = Depends(get_db)):
    reconstruction = db.query(models.Reconstruction).filter(models.Reconstruction.id == model_id).first()
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Model not found")
    return ReconstructionStatus.model_validate(reconstruction)


@router.get("/model/{model_id}/confidence")
def get_confidence(model_id: int, db: Session = Depends(get_db)):
    reconstruction = db.query(models.Reconstruction).filter(models.Reconstruction.id == model_id).first()
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Model not found")

    payload = {"confidence": reconstruction.confidence}
    if reconstruction.mesh_key:
        report = read_confidence_report(reconstruction.mesh_key)
        if report:
            payload.update(report)
    return payload

@router.get("/model/{model_id}/file")
def get_model_file(model_id: int, db: Session = Depends(get_db)):
    reconstruction = db.query(models.Reconstruction).filter(models.Reconstruction.id == model_id).first()
    if not reconstruction or not reconstruction.mesh_key:
        raise HTTPException(status_code=404, detail="Model not ready")

    path = get_path(reconstruction.mesh_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Model file missing")

    return FileResponse(path, media_type="model/gltf-binary", filename=f"model-{model_id}.glb")


@router.get("/model/{model_id}/export", response_model=ExportResponse)
def export_model(
    model_id: int,
    format: str = Query("stl", pattern="^(stl|obj|gltf)$"),
    db: Session = Depends(get_db),
):
    reconstruction = db.query(models.Reconstruction).filter(models.Reconstruction.id == model_id).first()
    if not reconstruction or not reconstruction.mesh_key:
        raise HTTPException(status_code=404, detail="Model not ready")

    base_data = read_file(reconstruction.mesh_key)
    input_format = "glb"
    output_format = format.lower()
    converted = convert_mesh(base_data, input_format=input_format, output_format=output_format)

    extension = "glb" if output_format == "gltf" else output_format
    key = save_export(converted, str(model_id), extension)
    url = f"/reconstruct/model/{model_id}/export-file?format={output_format}"
    user = _get_test_user(db)
    log_event(db, user.id, "export", f"model:{model_id}", f"format:{format}")
    return ExportResponse(download_url=url, format=format)


@router.get("/model/{model_id}/export-file")
def get_export_file(
    model_id: int,
    format: str = Query("stl", pattern="^(stl|obj|gltf)$"),
    db: Session = Depends(get_db),
):
    reconstruction = db.query(models.Reconstruction).filter(models.Reconstruction.id == model_id).first()
    if not reconstruction or not reconstruction.mesh_key:
        raise HTTPException(status_code=404, detail="Model not ready")

    extension = "glb" if format.lower() == "gltf" else format.lower()
    key = f"exports/{model_id}.{extension}"
    path = get_path(key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Export not found")

    media_type = {
        "stl": "model/stl",
        "obj": "text/plain",
        "glb": "model/gltf-binary",
    }[extension]

    return FileResponse(path, media_type=media_type, filename=f"model-{model_id}.{extension}")


@router.post("/model/{model_id}/share", response_model=ShareLinkResponse)
def share_model(
    model_id: int,
    db: Session = Depends(get_db),
):
    reconstruction = db.query(models.Reconstruction).filter(models.Reconstruction.id == model_id).first()
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Model not found")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=72)
    link = models.ShareLink(case_id=reconstruction.case_id, token=token, expires_at=expires_at)
    db.add(link)
    db.commit()

    user = _get_test_user(db)
    log_event(db, user.id, "share", f"model:{model_id}", f"token:{token}")
    return ShareLinkResponse(token=token, expires_at=expires_at)
