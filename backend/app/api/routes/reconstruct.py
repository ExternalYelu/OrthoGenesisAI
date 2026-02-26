from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
import hashlib
import hmac
import io
import json
import secrets
import zipfile

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import get_settings
from app.db import models
from app.db.session import SessionLocal
from app.reconstruction.registry import model_registry
from app.schemas.job import AsyncJobResponse, EnqueueResponse
from app.schemas.reconstruction import ReconstructionCreate, ReconstructionStatus
from app.schemas.export import ExportBundleRequest, ExportBundleResponse, ExportResponse
from app.schemas.share import ShareLinkResponse
from app.schemas.annotation import (
    AnnotationCommentCreate,
    AnnotationCreate,
    AnnotationResponse,
    AnnotationUpdate,
)
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


def _serialize_annotation(annotation: models.Annotation) -> AnnotationResponse:
    return AnnotationResponse(
        id=annotation.id,
        reconstruction_id=annotation.reconstruction_id,
        title=annotation.title,
        severity=annotation.severity,
        status=annotation.status,
        anchor=(annotation.anchor_x, annotation.anchor_y, annotation.anchor_z),
        created_at=annotation.created_at,
        updated_at=annotation.updated_at,
        comments=[
            {
                "id": comment.id,
                "author": comment.author,
                "message": comment.message,
                "created_at": comment.created_at,
            }
            for comment in sorted(annotation.comments, key=lambda item: item.created_at)
        ],
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
    if job.stage is None:
        job.stage = "queued"
    if job.progress is None:
        job.progress = 0
    return AsyncJobResponse.model_validate(job)


@router.get("/jobs/{job_id}/stream")
async def stream_job(job_id: str, db: Session = Depends(get_db)):
    first = db.query(models.AsyncJob).filter(models.AsyncJob.id == job_id).first()
    if not first:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        while True:
            with SessionLocal() as stream_db:
                job = stream_db.query(models.AsyncJob).filter(models.AsyncJob.id == job_id).first()
                if not job:
                    break
                payload = {
                    "id": job.id,
                    "status": job.status,
                    "stage": job.stage,
                    "progress": job.progress,
                    "eta_seconds": job.eta_seconds,
                    "attempts": job.attempts,
                    "max_attempts": job.max_attempts,
                    "error": job.error,
                    "result_json": job.result_json,
                    "updated_at": job.updated_at.isoformat() if job.updated_at else None,
                }
                yield f"data: {json.dumps(payload)}\n\n"
                if job.status in {"succeeded", "failed", "dead"}:
                    break
            await asyncio.sleep(1.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/dead-letter-jobs")
def get_dead_letter_jobs(limit: int = Query(25, ge=1, le=200), db: Session = Depends(get_db)):
    jobs = (
        db.query(models.AsyncJob)
        .filter(models.AsyncJob.dead_letter.is_(True))
        .order_by(models.AsyncJob.updated_at.desc())
        .limit(limit)
        .all()
    )
    rows = []
    for job in jobs:
        if job.stage is None:
            job.stage = "failed"
        if job.progress is None:
            job.progress = 0
        rows.append(AsyncJobResponse.model_validate(job).model_dump())
    return {"count": len(jobs), "jobs": rows}


@router.post("/jobs/{job_id}/retry", response_model=AsyncJobResponse)
def retry_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(models.AsyncJob).filter(models.AsyncJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = "queued"
    job.dead_letter = False
    job.error = None
    job.stage = "queued"
    job.progress = 0
    job.eta_seconds = 45
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
    preset: str = Query("clinical", pattern="^(draft|clinical|print|web)$"),
    units: str = Query("mm", pattern="^(mm|cm|in)$"),
    tolerance_mm: float = Query(0.25, ge=0.01, le=5.0),
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
            payload={
                "model_id": model_id,
                "format": format.lower(),
                "preset": preset,
                "units": units,
                "tolerance_mm": tolerance_mm,
            },
            max_attempts=3,
        )
        url = f"/reconstruct/jobs/{job.id}"
        user = _get_test_user(db)
        log_event(db, user.id, "export_queued", f"model:{model_id}", f"job:{job.id}")
        return ExportResponse(download_url=url, format=format)

    base_data = read_file(reconstruction.mesh_key)
    input_format = "glb"
    output_format = format.lower()
    profile = preset if preset in {"draft", "clinical", "print", "web"} else "clinical"
    converted = convert_mesh(
        base_data,
        input_format=input_format,
        output_format=output_format,
        quality_profile=profile,
        units=units,
        tolerance_mm=tolerance_mm,
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


@router.post("/model/{model_id}/export-bundle", response_model=ExportBundleResponse)
def export_bundle(
    model_id: int,
    payload: ExportBundleRequest | None = Body(default=None),
    db: Session = Depends(get_db),
):
    payload = payload or ExportBundleRequest()
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
    if not reconstruction or not reconstruction.mesh_key:
        raise HTTPException(status_code=404, detail="Model not ready")

    base_data = read_file(reconstruction.mesh_key)
    formats = [fmt.lower() for fmt in payload.formats if fmt.lower() in {"stl", "obj", "gltf"}]
    if not formats:
        raise HTTPException(status_code=400, detail="At least one format is required")

    bundle_buffer = io.BytesIO()
    manifest = {
        "model_id": model_id,
        "preset": payload.preset,
        "units": payload.units,
        "tolerance_mm": payload.tolerance_mm,
        "generated_at": datetime.utcnow().isoformat(),
        "files": [],
    }

    with zipfile.ZipFile(bundle_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for fmt in formats:
            output = convert_mesh(
                base_data,
                input_format="glb",
                output_format=fmt,
                quality_profile=payload.preset,
                units=payload.units,
                tolerance_mm=payload.tolerance_mm,
            )
            extension = "glb" if fmt == "gltf" else fmt
            filename = f"model-{model_id}.{extension}"
            checksum = hashlib.sha256(output).hexdigest()
            archive.writestr(filename, output)
            manifest["files"].append(
                {
                    "format": fmt,
                    "filename": filename,
                    "checksum_sha256": checksum,
                }
            )
        archive.writestr("manifest.json", json.dumps(manifest, indent=2))

    bundle_key = save_export(bundle_buffer.getvalue(), f"{model_id}_bundle", "zip")
    return ExportBundleResponse(
        download_url=f"/reconstruct/model/{model_id}/export-bundle/file?key={bundle_key}",
        manifest=manifest,
    )


@router.get("/model/{model_id}/export-bundle/file")
def download_export_bundle(model_id: int, key: str = Query(...), db: Session = Depends(get_db)):
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Model not found")

    if not key.startswith("exports/") or f"{model_id}_" not in key:
        raise HTTPException(status_code=400, detail="Invalid bundle key")

    path = get_path(key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Bundle not found")
    return FileResponse(path, media_type="application/zip", filename=f"model-{model_id}-bundle.zip")


@router.post("/model/{model_id}/export/submit", response_model=EnqueueResponse)
def submit_export_job(
    model_id: int,
    format: str = Query("stl", pattern="^(stl|obj|gltf)$"),
    preset: str = Query("clinical", pattern="^(draft|clinical|print|web)$"),
    units: str = Query("mm", pattern="^(mm|cm|in)$"),
    tolerance_mm: float = Query(0.25, ge=0.01, le=5.0),
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
        payload={
            "model_id": model_id,
            "format": format.lower(),
            "preset": preset,
            "units": units,
            "tolerance_mm": tolerance_mm,
        },
        max_attempts=3,
    )
    return EnqueueResponse(job_id=job.id, status=job.status, resource_id=model_id)


@router.get("/model/{model_id}/annotations", response_model=list[AnnotationResponse])
def list_annotations(model_id: int, db: Session = Depends(get_db)):
    annotations = (
        db.query(models.Annotation)
        .filter(
            models.Annotation.reconstruction_id == model_id,
            models.Annotation.deleted_at.is_(None),
        )
        .order_by(models.Annotation.created_at.asc())
        .all()
    )
    for annotation in annotations:
        annotation.comments = sorted(annotation.comments, key=lambda item: item.created_at)
    return [_serialize_annotation(annotation) for annotation in annotations]


@router.post("/model/{model_id}/annotations", response_model=AnnotationResponse)
def create_annotation(model_id: int, payload: AnnotationCreate, db: Session = Depends(get_db)):
    reconstruction = (
        db.query(models.Reconstruction)
        .filter(models.Reconstruction.id == model_id, models.Reconstruction.deleted_at.is_(None))
        .first()
    )
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Model not found")

    annotation = models.Annotation(
        reconstruction_id=model_id,
        title=payload.title,
        severity=payload.severity,
        status=payload.status,
        anchor_x=float(payload.anchor[0]),
        anchor_y=float(payload.anchor[1]),
        anchor_z=float(payload.anchor[2]),
        updated_at=datetime.utcnow(),
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)

    if payload.comment:
        comment = models.AnnotationComment(
            annotation_id=annotation.id,
            author=payload.comment.author,
            message=payload.comment.message,
        )
        db.add(comment)
        db.commit()
        db.refresh(annotation)

    return _serialize_annotation(annotation)


@router.patch("/model/{model_id}/annotations/{annotation_id}", response_model=AnnotationResponse)
def update_annotation(
    model_id: int, annotation_id: int, payload: AnnotationUpdate, db: Session = Depends(get_db)
):
    annotation = (
        db.query(models.Annotation)
        .filter(
            models.Annotation.id == annotation_id,
            models.Annotation.reconstruction_id == model_id,
            models.Annotation.deleted_at.is_(None),
        )
        .first()
    )
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    if payload.title is not None:
        annotation.title = payload.title
    if payload.severity is not None:
        annotation.severity = payload.severity
    if payload.status is not None:
        annotation.status = payload.status
    annotation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(annotation)
    return _serialize_annotation(annotation)


@router.post(
    "/model/{model_id}/annotations/{annotation_id}/comments", response_model=AnnotationResponse
)
def add_annotation_comment(
    model_id: int,
    annotation_id: int,
    payload: AnnotationCommentCreate,
    db: Session = Depends(get_db),
):
    annotation = (
        db.query(models.Annotation)
        .filter(
            models.Annotation.id == annotation_id,
            models.Annotation.reconstruction_id == model_id,
            models.Annotation.deleted_at.is_(None),
        )
        .first()
    )
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    comment = models.AnnotationComment(
        annotation_id=annotation.id,
        author=payload.author,
        message=payload.message,
    )
    annotation.updated_at = datetime.utcnow()
    db.add(comment)
    db.commit()
    db.refresh(annotation)
    return _serialize_annotation(annotation)


@router.delete("/model/{model_id}/annotations/{annotation_id}")
def delete_annotation(model_id: int, annotation_id: int, db: Session = Depends(get_db)):
    annotation = (
        db.query(models.Annotation)
        .filter(
            models.Annotation.id == annotation_id,
            models.Annotation.reconstruction_id == model_id,
            models.Annotation.deleted_at.is_(None),
        )
        .first()
    )
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    annotation.deleted_at = datetime.utcnow()
    annotation.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "deleted", "annotation_id": annotation_id}


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
