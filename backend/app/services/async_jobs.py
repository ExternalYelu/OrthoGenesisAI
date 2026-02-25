from __future__ import annotations

import hashlib
import hmac
import json
import threading
import time
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import models
from app.db.session import SessionLocal
from app.reconstruction.confidence import ConfidenceCalibrator
from app.reconstruction.engine import XRayInput
from app.reconstruction.pipeline import ReconstructionPipeline
from app.services.mesh import convert_mesh
from app.storage.local import read_file, save_export, save_uncertainty_map


def _utcnow() -> datetime:
    return datetime.utcnow()


def _hash_payload(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def enqueue_job(
    db: Session, *, job_type: str, payload: dict[str, Any], max_attempts: int = 3
) -> models.AsyncJob:
    job = models.AsyncJob(
        id=uuid.uuid4().hex,
        job_type=job_type,
        status="queued",
        payload_json=payload,
        result_json=None,
        attempts=0,
        max_attempts=max_attempts,
        dead_letter=False,
        available_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


class AsyncJobWorker:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._poll_interval_sec = 1.0
        self.backend_mode = "local"

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        configured = get_settings().queue_backend.lower()
        # RQ/Celery hooks can be attached here; local DB worker remains active fallback.
        self.backend_mode = configured if configured in {"rq", "celery", "local"} else "local"
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="async-job-worker")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=2.0)

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            processed = self._try_process_one()
            if not processed:
                time.sleep(self._poll_interval_sec)

    def _try_process_one(self) -> bool:
        with SessionLocal() as db:
            now = _utcnow()
            job = (
                db.query(models.AsyncJob)
                .filter(
                    models.AsyncJob.status == "queued",
                    models.AsyncJob.dead_letter.is_(False),
                    models.AsyncJob.available_at <= now,
                )
                .order_by(models.AsyncJob.created_at.asc())
                .first()
            )
            if not job:
                return False

            job.status = "running"
            job.attempts = int(job.attempts or 0) + 1
            job.updated_at = now
            db.commit()
            job_id = job.id

        try:
            self._process_job(job_id)
        except Exception as exc:
            self._mark_failure(job_id, str(exc))
        return True

    def _process_job(self, job_id: str) -> None:
        with SessionLocal() as db:
            job = db.query(models.AsyncJob).filter(models.AsyncJob.id == job_id).first()
            if not job:
                return
            payload = job.payload_json or {}

            if job.job_type == "reconstruct":
                result = self._process_reconstruct(db, payload)
            elif job.job_type == "export":
                result = self._process_export(db, payload)
            else:
                raise ValueError(f"Unsupported job type: {job.job_type}")

            job.status = "succeeded"
            job.result_json = result
            job.error = None
            job.updated_at = _utcnow()
            job.finished_at = _utcnow()
            db.commit()

    def _mark_failure(self, job_id: str, error: str) -> None:
        with SessionLocal() as db:
            job = db.query(models.AsyncJob).filter(models.AsyncJob.id == job_id).first()
            if not job:
                return

            retry_count = int(job.attempts or 0)
            max_attempts = int(job.max_attempts or 1)
            if retry_count < max_attempts:
                backoff = min(30, 2**max(1, retry_count))
                job.status = "queued"
                job.available_at = _utcnow() + timedelta(seconds=backoff)
                job.error = error[:2000]
                job.updated_at = _utcnow()
            else:
                job.status = "dead"
                job.dead_letter = True
                job.error = error[:2000]
                job.updated_at = _utcnow()
                job.finished_at = _utcnow()
            db.commit()

    def _process_reconstruct(self, db: Session, payload: dict[str, Any]) -> dict[str, Any]:
        case_id = int(payload["case_id"])
        reconstruction_id = int(payload["reconstruction_id"])

        reconstruction = (
            db.query(models.Reconstruction).filter(models.Reconstruction.id == reconstruction_id).first()
        )
        if not reconstruction:
            raise ValueError("Reconstruction record not found")
        reconstruction.status = "running"
        reconstruction.updated_at = _utcnow()
        db.commit()

        xrays = (
            db.query(models.XRayImage)
            .filter(models.XRayImage.case_id == case_id, models.XRayImage.deleted_at.is_(None))
            .all()
        )
        if not xrays:
            raise ValueError("No X-rays available for reconstruction")

        input_set_hash = _hash_payload(
            {"case_id": case_id, "xray_ids": [x.id for x in xrays], "file_keys": [x.file_key for x in xrays]}
        )

        settings = get_settings()
        model_name = str(payload.get("model_name") or settings.reconstruction_model)
        seed = int(payload.get("seed") if payload.get("seed") is not None else settings.reconstruction_seed)
        pipeline = ReconstructionPipeline(
            model_name=model_name,
            seed=seed,
            batch_size=settings.reconstruction_batch_size,
        )
        inputs = [
            XRayInput(view=xray.view, content_type="image/png", data=read_file(xray.file_key))
            for xray in xrays
        ]
        result, statuses = pipeline.run(inputs)
        calibrator = ConfidenceCalibrator(version="calib-v1")
        calibrated_conf = calibrator.calibrate(result.confidence)
        uncertainty = calibrator.build_uncertainty_map(result.confidence_report)
        uncertainty_map_key = save_uncertainty_map(result.mesh_key, uncertainty)

        reconstruction.status = "complete"
        reconstruction.confidence = calibrated_conf
        reconstruction.mesh_key = result.mesh_key
        reconstruction.notes = result.notes
        reconstruction.input_set_hash = input_set_hash
        reconstruction.pipeline_version = result.pipeline_version
        reconstruction.confidence_version = calibrator.version
        reconstruction.uncertainty_map_key = uncertainty_map_key
        reconstruction.updated_at = _utcnow()
        db.commit()
        db.refresh(reconstruction)

        model_version = models.ModelVersion(
            reconstruction_id=reconstruction.id,
            mesh_key=result.mesh_key,
            version=1,
            input_set_hash=input_set_hash,
            pipeline_version=result.pipeline_version,
            confidence_version=calibrator.version,
            uncertainty_map_key=uncertainty_map_key,
            metrics_json=result.confidence_report or {},
            is_active=True,
        )
        db.add(model_version)
        db.commit()

        return {
            "reconstruction_id": reconstruction.id,
            "status": reconstruction.status,
            "mesh_key": reconstruction.mesh_key,
            "pipeline_version": reconstruction.pipeline_version,
            "steps": [s.__dict__ for s in statuses],
        }

    def _process_export(self, db: Session, payload: dict[str, Any]) -> dict[str, Any]:
        model_id = int(payload["model_id"])
        export_format = str(payload.get("format", "stl")).lower()

        reconstruction = db.query(models.Reconstruction).filter(models.Reconstruction.id == model_id).first()
        if not reconstruction or not reconstruction.mesh_key:
            raise ValueError("Model not ready for export")

        base_data = read_file(reconstruction.mesh_key)
        output_format = "glb" if export_format == "gltf" else export_format
        profile = "print" if output_format == "stl" else "clinical"
        converted = convert_mesh(
            base_data, input_format="glb", output_format=output_format, quality_profile=profile
        )

        export_version = (
            db.query(models.ExportArtifact)
            .filter(
                models.ExportArtifact.reconstruction_id == reconstruction.id,
                models.ExportArtifact.format == export_format,
            )
            .count()
            + 1
        )
        key = save_export(converted, f"{model_id}_v{export_version}", output_format)
        checksum = hashlib.sha256(converted).hexdigest()
        secret = get_settings().secret_key.encode("utf-8")
        signature = hmac.new(secret, checksum.encode("utf-8"), digestmod=hashlib.sha256).hexdigest()
        expires_at = _utcnow() + timedelta(hours=72)

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
            format=export_format,
            file_key=key,
            checksum_sha256=checksum,
            signature=signature,
            version=export_version,
            status="ready",
            expires_at=expires_at,
        )
        db.add(artifact)
        db.commit()
        db.refresh(artifact)

        return {
            "model_id": model_id,
            "format": export_format,
            "file_key": key,
            "artifact_id": artifact.id,
            "checksum_sha256": checksum,
            "signature": signature,
            "expires_at": expires_at.isoformat(),
            "download_url": f"/reconstruct/model/{model_id}/export-file?artifact_id={artifact.id}",
        }


job_worker = AsyncJobWorker()
