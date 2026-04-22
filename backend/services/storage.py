import os
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from db import OUTPUT_DIR, UPLOAD_DIR


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".jfif"}


@dataclass
class StoredFile:
    filename: str
    url: str
    storage_key: str
    backend: str


def _public_base_url():
    return os.getenv("R2_PUBLIC_BASE_URL", "").rstrip("/")


def r2_enabled():
    required = [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "R2_PUBLIC_BASE_URL",
    ]
    return all(os.getenv(key) for key in required)


def _r2_client():
    import boto3

    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _content_type(filename: str, fallback: str = "application/octet-stream"):
    suffix = Path(filename).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".jfif"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".html":
        return "text/html; charset=utf-8"
    return fallback


def save_upload_image(upload_file: UploadFile, base_url: str) -> StoredFile | None:
    ext = Path(upload_file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return None

    filename = f"{uuid4().hex}{ext}"
    storage_key = f"uploads/{filename}"

    if r2_enabled():
        client = _r2_client()
        client.upload_fileobj(
            upload_file.file,
            os.environ["R2_BUCKET"],
            storage_key,
            ExtraArgs={"ContentType": _content_type(filename)},
        )
        return StoredFile(
            filename=filename,
            url=f"{_public_base_url()}/{storage_key}",
            storage_key=storage_key,
            backend="r2",
        )

    file_path = UPLOAD_DIR / filename
    with file_path.open("wb") as buffer:
        while chunk := upload_file.file.read(1024 * 1024):
            buffer.write(chunk)

    return StoredFile(
        filename=filename,
        url=f"{base_url}/uploads/{filename}",
        storage_key=storage_key,
        backend="local",
    )


def save_html_file(html: str, base_url: str) -> StoredFile:
    filename = f"{uuid4().hex}.html"
    storage_key = f"outputs/{filename}"

    if r2_enabled():
        client = _r2_client()
        client.put_object(
            Bucket=os.environ["R2_BUCKET"],
            Key=storage_key,
            Body=html.encode("utf-8"),
            ContentType="text/html; charset=utf-8",
        )
        return StoredFile(
            filename=filename,
            url=f"{_public_base_url()}/{storage_key}",
            storage_key=storage_key,
            backend="r2",
        )

    file_path = OUTPUT_DIR / filename
    file_path.write_text(html, encoding="utf-8")
    return StoredFile(
        filename=filename,
        url=f"{base_url}/outputs/{filename}",
        storage_key=storage_key,
        backend="local",
    )


def delete_stored_file(filename: str | None, storage_key: str | None):
    key = storage_key or ""
    if r2_enabled() and key:
        client = _r2_client()
        client.delete_object(Bucket=os.environ["R2_BUCKET"], Key=key)
        return

    if key.startswith("uploads/"):
        path = UPLOAD_DIR / Path(key).name
    elif key.startswith("outputs/"):
        path = OUTPUT_DIR / Path(key).name
    elif filename and filename.endswith(".html"):
        path = OUTPUT_DIR / filename
    elif filename:
        path = UPLOAD_DIR / filename
    else:
        return

    path.unlink(missing_ok=True)
