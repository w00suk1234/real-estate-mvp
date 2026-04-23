import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import UploadFile

from db import OUTPUT_DIR, UPLOAD_DIR


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".jfif"}
R2_REQUIRED_KEYS = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
]


@dataclass
class StoredFile:
    filename: str
    url: str
    storage_key: str
    backend: str


def _public_base_url():
    return os.getenv("R2_PUBLIC_BASE_URL", "").rstrip("/")


def r2_enabled():
    return all(os.getenv(key) for key in R2_REQUIRED_KEYS)


def r2_missing_keys():
    return [key for key in R2_REQUIRED_KEYS if not os.getenv(key)]


def storage_backend_preference():
    return os.getenv("STORAGE_BACKEND", "auto").strip().lower()


def r2_required():
    return storage_backend_preference() in {"r2", "cloudflare-r2"}


def storage_status():
    missing = r2_missing_keys()
    return {
        "active_backend": "r2" if r2_enabled() else "local",
        "storage_backend": storage_backend_preference(),
        "r2_enabled": r2_enabled(),
        "r2_required": r2_required(),
        "missing_r2_variables": missing,
    }


def ensure_storage_configured():
    preference = storage_backend_preference()
    if preference not in {"auto", "local", "r2", "cloudflare-r2"}:
        raise RuntimeError(
            "STORAGE_BACKEND must be one of: auto, local, r2, cloudflare-r2"
        )

    if r2_required() and not r2_enabled():
        missing = ", ".join(r2_missing_keys())
        raise RuntimeError(f"R2 storage is required, but these variables are missing: {missing}")


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
    ensure_storage_configured()

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


def save_remote_image(image_url: str, base_url: str) -> StoredFile | None:
    ensure_storage_configured()

    parsed = urlparse(image_url or "")
    if parsed.scheme not in {"http", "https"}:
        return None

    ext = Path(parsed.path).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        ext = ".jpg"

    filename = f"{uuid4().hex}{ext}"
    storage_key = f"uploads/{filename}"
    request = Request(
        image_url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://new.land.naver.com/",
        },
    )

    with urlopen(request, timeout=15) as response:
        body = response.read(12 * 1024 * 1024)

    if r2_enabled():
        client = _r2_client()
        client.put_object(
            Bucket=os.environ["R2_BUCKET"],
            Key=storage_key,
            Body=body,
            ContentType=_content_type(filename, "image/jpeg"),
        )
        return StoredFile(
            filename=filename,
            url=f"{_public_base_url()}/{storage_key}",
            storage_key=storage_key,
            backend="r2",
        )

    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(body)
    return StoredFile(
        filename=filename,
        url=f"{base_url}/uploads/{filename}",
        storage_key=storage_key,
        backend="local",
    )


def save_html_file(html: str, base_url: str) -> StoredFile:
    ensure_storage_configured()

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
