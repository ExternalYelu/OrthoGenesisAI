from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any

import numpy as np
from PIL import Image

try:
    import pydicom
except Exception:  # pragma: no cover - optional dependency in some local setups
    pydicom = None


@dataclass
class DicomIngestionResult:
    deidentified_bytes: bytes
    render_bytes: bytes
    metadata: dict[str, Any]
    study_instance_uid: str | None
    series_instance_uid: str | None
    view: str | None
    body_part: str | None
    orientation: str | None
    spacing_x: float | None
    spacing_y: float | None
    modality: str | None
    accession_number: str | None


def is_dicom_upload(filename: str | None, content_type: str | None, content: bytes) -> bool:
    suffix = (filename or "").lower()
    ctype = (content_type or "").lower()
    if suffix.endswith(".dcm") or "dicom" in ctype:
        return True
    return len(content) > 132 and content[128:132] == b"DICM"


def _safe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_to_uint8(array: np.ndarray) -> np.ndarray:
    arr = array.astype(np.float32)
    low = float(np.percentile(arr, 1.0))
    high = float(np.percentile(arr, 99.0))
    denom = max(1e-6, high - low)
    out = np.clip((arr - low) / denom, 0.0, 1.0)
    return np.round(out * 255.0).astype(np.uint8)


def _deidentify_dataset(dataset: "pydicom.dataset.FileDataset") -> None:
    fields = [
        "PatientName",
        "PatientID",
        "PatientBirthDate",
        "PatientSex",
        "PatientAge",
        "PatientAddress",
        "InstitutionName",
        "InstitutionAddress",
        "ReferringPhysicianName",
        "OperatorsName",
    ]
    for field in fields:
        if field in dataset:
            dataset.data_element(field).value = ""
    dataset.remove_private_tags()


def ingest_dicom(content: bytes) -> DicomIngestionResult:
    if pydicom is None:
        raise RuntimeError("pydicom is required for DICOM ingestion. Install with: pip install pydicom")

    ds = pydicom.dcmread(BytesIO(content), force=True)
    if "PixelData" not in ds:
        raise ValueError("DICOM file has no pixel data")

    _deidentify_dataset(ds)

    pixel_array = ds.pixel_array.astype(np.float32)
    slope = float(getattr(ds, "RescaleSlope", 1.0) or 1.0)
    intercept = float(getattr(ds, "RescaleIntercept", 0.0) or 0.0)
    pixel_array = pixel_array * slope + intercept

    if _safe_str(getattr(ds, "PhotometricInterpretation", None)) == "MONOCHROME1":
        pixel_array = pixel_array.max() - pixel_array

    image_uint8 = _normalize_to_uint8(pixel_array)
    image = Image.fromarray(image_uint8, mode="L")
    output = BytesIO()
    image.save(output, format="PNG")

    dicom_bytes = BytesIO()
    ds.save_as(dicom_bytes, write_like_original=False)

    orientation_values = getattr(ds, "ImageOrientationPatient", None)
    orientation = None
    if orientation_values is not None:
        orientation = ",".join(str(v) for v in orientation_values)

    spacing_values = getattr(ds, "PixelSpacing", None)
    spacing_x = float(spacing_values[0]) if spacing_values and len(spacing_values) > 0 else None
    spacing_y = float(spacing_values[1]) if spacing_values and len(spacing_values) > 1 else None

    metadata = {
        "modality": _safe_str(getattr(ds, "Modality", None)),
        "study_instance_uid": _safe_str(getattr(ds, "StudyInstanceUID", None)),
        "series_instance_uid": _safe_str(getattr(ds, "SeriesInstanceUID", None)),
        "accession_number": _safe_str(getattr(ds, "AccessionNumber", None)),
        "body_part_examined": _safe_str(getattr(ds, "BodyPartExamined", None)),
        "view_position": _safe_str(getattr(ds, "ViewPosition", None)),
        "pixel_spacing": [spacing_x, spacing_y],
        "image_orientation_patient": orientation,
        "rows": int(getattr(ds, "Rows", 0) or 0),
        "columns": int(getattr(ds, "Columns", 0) or 0),
    }

    return DicomIngestionResult(
        deidentified_bytes=dicom_bytes.getvalue(),
        render_bytes=output.getvalue(),
        metadata=metadata,
        study_instance_uid=metadata["study_instance_uid"],
        series_instance_uid=metadata["series_instance_uid"],
        view=metadata["view_position"],
        body_part=metadata["body_part_examined"],
        orientation=orientation,
        spacing_x=spacing_x,
        spacing_y=spacing_y,
        modality=metadata["modality"],
        accession_number=metadata["accession_number"],
    )
