from __future__ import annotations

import uuid
from typing import BinaryIO

import boto3

from app.core.config import get_settings


def get_s3_client():
    settings = get_settings()
    session = boto3.session.Session()
    return session.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )


def ensure_bucket() -> None:
    settings = get_settings()
    s3 = get_s3_client()
    try:
        s3.head_bucket(Bucket=settings.s3_bucket)
    except Exception:
        s3.create_bucket(Bucket=settings.s3_bucket)


def upload_file(file_obj: BinaryIO, content_type: str, prefix: str) -> str:
    settings = get_settings()
    s3 = get_s3_client()
    ensure_bucket()
    key = f"{prefix}/{uuid.uuid4().hex}"
    s3.upload_fileobj(
        file_obj,
        settings.s3_bucket,
        key,
        ExtraArgs={"ContentType": content_type},
    )
    return key


def upload_bytes(data: bytes, content_type: str, key: str | None = None, prefix: str | None = None) -> str:
    settings = get_settings()
    s3 = get_s3_client()
    ensure_bucket()
    if not key:
        prefix_value = prefix or "uploads"
        key = f"{prefix_value}/{uuid.uuid4().hex}"
    s3.put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type)
    return key



def presign_download(key: str, expires_in: int = 3600) -> str:
    settings = get_settings()
    s3 = get_s3_client()
    return s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )


def download_file(key: str) -> bytes:
    settings = get_settings()
    s3 = get_s3_client()
    response = s3.get_object(Bucket=settings.s3_bucket, Key=key)
    return response["Body"].read()
