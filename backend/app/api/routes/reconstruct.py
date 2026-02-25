from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import hmac
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import get_settings
from app.db import models
from app.reconstruction.registry import model_registry
from app.schemas.job import AsyncJobResponse, EnqueueResponse
from app.schemas.reconstruction import ReconstructionCreate, ReconstructionStatus
from app.schemas.export import ExportResponse
from app.schemas.share import ShareLinkResponse
from app.storage.local import read_confidence_report, read_file, get_path, read_uncertainty_map, save_export
from app.services.audit import log_event
from app.services.async_jobs import enqueue_job, job_worker
from app.services.mesh import convert_mesh

router = APIRouter(prefix="/reconstruct", tags=["reconstruct"])


@router.get("/models")
def get_reconstruction_models():
    return {"models": model_registry.list_models()}


@router.get("/queue")
def get_queue_backend():
    return {"backend": job_worker.backend_mode}

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
    case = (
        db.query(models.Case)
        .filter(models.Case.id == payload.case_id, models.Case.deleted_at.is_(None))
        .first()
    )
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    xrays = (
        db.query(models.XRayImage)
        .filter(models.XRayImage.case_id == case.id, models.XRayImage.deleted_at.is_(None))
        .all()
    )
    if not xrays:
        raise HTTPException(status_code=400, detail="No X-rays found")

    reconstruction = models.Reconstruction(
        case_id=case.id,
        status="queued",
        pipeline_version="queued",
    )
    db.add(reconstruction)
    db.commit()
    db.refresh(reconstruction)

    job = enqueue_job(
        db,
        job_type="reconstruct",
        payload={
            "case_id": case.id,
            "reconstruction_id": reconstruction.id,
            "model_name": payload.model_name,
            "seed": payload.seed,
        },
        max_attempts=3,
    )
    reconstruction.notes = f"Queued with job:{job.id}"
    db.commit()
    db.refresh(reconstruction)

    user = _get_test_user(db)
    log_event(db, user.id, "reconstruct", f"case:{case.id}", f"model:{reconstruction.id}")
    return ReconstructionStatus.model_validate(reconstruction)


@router.get("/jobs/{job_id}", response_model=AsyncJobResponse)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.AsyncJob).filter(models.AsyncJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return AsyncJobResponse.model_validate(job)


@router.get("/dead-letter-jobs")
def get_dead_letter_jobs(limit: int = Query(25, ge=1, le=200), db: Session = Depends(get_db)):
    jobs = (
        db.query(models.AsyncJob)
        .filter(models.AsyncJob.dead_letter.is_(True))
        .order_by(models.AsyncJob.updated_at.desc())
        .limit(limit)
        .all()
    )
    return {"count": len(jobs), "jobs": [AsyncJobResponse.model_validate(job).model_dump() for job in jobs]}


@router.post("/jobs/{job_id}/retry", response_model=AsyncJobResponse)
def retry_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.AsyncJob).filter(models.AsyncJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = "queued"
    job.dead_letter = False
    job.error = None
    job.available_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return AsyncJobResponse.model_validate(job)


@router.get("/model/{model_id}", response_model=ReconstructionStatus)
def get_model(model_id: int, db: Session = Depends(get_db)):
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Model not found")
    return ReconstructionStatus.model_validate(reconstruction)


@router.get("/model/{model_id}/confidence")
def get_confidence(model_id: int, db: Session = Depends(get_db)):
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Model not found")

    payload = {"confidence": reconstruction.confidence}
    if reconstruction.mesh_key:
        report = read_confidence_report(reconstruction.mesh_key)
        if report:
            payload.update(report)
    uncertainty = read_uncertainty_map(reconstruction.uncertainty_map_key)
    if uncertainty:
        payload["uncertainty"] = uncertainty
    if reconstruction.confidence_version:
        payload["confidence_version"] = reconstruction.confidence_version
    return payload

@router.get("/model/{model_id}/file")
def get_model_file(model_id: int, db: Session = Depends(get_db)):
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
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
    async_mode: bool = Query(False),
    db: Session = Depends(get_db),
):
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
    if not reconstruction or not reconstruction.mesh_key:
        raise HTTPException(status_code=404, detail="Model not ready")

    if async_mode:
        job = enqueue_job(
            db,
            job_type="export",
            payload={"model_id": model_id, "format": format.lower()},
            max_attempts=3,
        )
        url = f"/reconstruct/jobs/{job.id}"
        user = _get_test_user(db)
        log_event(db, user.id, "export_queued", f"model:{model_id}", f"job:{job.id}")
        return ExportResponse(download_url=url, format=format)

    base_data = read_file(reconstruction.mesh_key)
    input_format = "glb"
    output_format = format.lower()
    profile = "print" if output_format == "stl" else "clinical"
    converted = convert_mesh(
        base_data, input_format=input_format, output_format=output_format, quality_profile=profile
    )

    extension = "glb" if output_format == "gltf" else output_format
    export_version = (
        db.query(models.ExportArtifact)
        .filter(
            models.ExportArtifact.reconstruction_id == reconstruction.id,
            models.ExportArtifact.format == output_format,
            models.ExportArtifact.deleted_at.is_(None),
        )
        .count()
        + 1
    )
    key = save_export(converted, f"{model_id}_v{export_version}", extension)
    checksum = hashlib.sha256(converted).hexdigest()
    signature = hmac.new(
        get_settings().secret_key.encode("utf-8"), checksum.encode("utf-8"), digestmod=hashlib.sha256
    ).hexdigest()
    expires_at = datetime.utcnow() + timedelta(hours=72)

    model_version = (
        db.query(models.ModelVersion)
        .filter(
            models.ModelVersion.reconstruction_id == reconstruction.id,
            models.ModelVersion.is_active.is_(True),
            models.ModelVersion.deleted_at.is_(None),
        )
        .order_by(models.ModelVersion.created_at.desc())
        .first()
    )
    artifact = models.ExportArtifact(
        reconstruction_id=reconstruction.id,
        model_version_id=model_version.id if model_version else None,
        format=output_format,
        file_key=key,
        checksum_sha256=checksum,
        signature=signature,
        version=export_version,
        status="ready",
        expires_at=expires_at,
    )
    db.add(artifact)
    db.commit()

    url = f"/reconstruct/model/{model_id}/export-file?artifact_id={artifact.id}"
    user = _get_test_user(db)
    log_event(db, user.id, "export", f"model:{model_id}", f"format:{format}")
    return ExportResponse(download_url=url, format=format)


@router.get("/model/{model_id}/export-file")
def get_export_file(
    model_id: int,
    format: str = Query("stl", pattern="^(stl|obj|gltf)$"),
    artifact_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
    if not reconstruction or not reconstruction.mesh_key:
        raise HTTPException(status_code=404, detail="Model not ready")

    if artifact_id is not None:
        artifact = (
            db.query(models.ExportArtifact)
            .filter(
                models.ExportArtifact.id == artifact_id,
                models.ExportArtifact.reconstruction_id == model_id,
                models.ExportArtifact.deleted_at.is_(None),
            )
            .first()
        )
        if not artifact:
            raise HTTPException(status_code=404, detail="Export artifact not found")
        if artifact.expires_at and artifact.expires_at < datetime.utcnow():
            raise HTTPException(status_code=410, detail="Export artifact expired")
        key = artifact.file_key
        extension = "glb" if artifact.format.lower() == "gltf" else artifact.format.lower()
    else:
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


@router.get("/model/{model_id}/exports")
def list_export_artifacts(model_id: int, db: Session = Depends(get_db)):
    artifacts = (
        db.query(models.ExportArtifact)
        .filter(
            models.ExportArtifact.reconstruction_id == model_id,
            models.ExportArtifact.deleted_at.is_(None),
        )
        .order_by(models.ExportArtifact.created_at.desc())
        .all()
    )
    return {
        "model_id": model_id,
        "artifacts": [
            {
                "id": a.id,
                "format": a.format,
                "version": a.version,
                "status": a.status,
                "checksum_sha256": a.checksum_sha256,
                "signature": a.signature,
                "expires_at": a.expires_at.isoformat() if a.expires_at else None,
                "download_url": f"/reconstruct/model/{model_id}/export-file?artifact_id={a.id}",
            }
            for a in artifacts
        ],
    }


@router.post("/model/{model_id}/export/submit", response_model=EnqueueResponse)
def submit_export_job(
    model_id: int,
    format: str = Query("stl", pattern="^(stl|obj|gltf)$"),
    db: Session = Depends(get_db),
):
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
    if not reconstruction or not reconstruction.mesh_key:
        raise HTTPException(status_code=404, detail="Model not ready")

    job = enqueue_job(
        db,
        job_type="export",
        payload={"model_id": model_id, "format": format.lower()},
        max_attempts=3,
    )
    return EnqueueResponse(job_id=job.id, status=job.status, resource_id=model_id)


@router.post("/model/{model_id}/share", response_model=ShareLinkResponse)
def share_model(
    model_id: int,
    db: Session = Depends(get_db),
):
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
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
