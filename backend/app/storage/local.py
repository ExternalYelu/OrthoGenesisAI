from __future__ import annotations

from pathlib import Path
import uuid

BASE_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
MODEL_DIR = DATA_DIR / "models"
EXPORT_DIR = DATA_DIR / "exports"


def ensure_dirs() -> None:
    for directory in (UPLOAD_DIR, MODEL_DIR, EXPORT_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def save_upload(content: bytes, filename: str) -> str:
    ensure_dirs()
    ext = Path(filename).suffix.lower() or ".png"
    key = f"uploads/{uuid.uuid4().hex}{ext}"
    path = DATA_DIR / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return key


def save_model(data: bytes, model_id: str | None = None, ext: str = "glb") -> str:
    ensure_dirs()
    model_id = model_id or uuid.uuid4().hex
    key = f"models/{model_id}.{ext}"
    path = DATA_DIR / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key


def save_export(data: bytes, model_id: str, ext: str) -> str:
    ensure_dirs()
    key = f"exports/{model_id}.{ext}"
    path = DATA_DIR / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key


def read_file(key: str) -> bytes:
    path = DATA_DIR / key
    return path.read_bytes()


def get_path(key: str) -> Path:
    return DATA_DIR / key
