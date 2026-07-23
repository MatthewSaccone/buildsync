import os
import uuid

from fastapi import HTTPException, UploadFile

from app.core.config import settings

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
SHEET_EXTENSIONS = IMAGE_EXTENSIONS | {".pdf"}


def save_upload(file: UploadFile, allowed_extensions: set[str]) -> str:
    """Validates extension + size, writes to disk, returns the stored file path."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or '(none)'}")

    os.makedirs(settings.upload_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = os.path.join(settings.upload_dir, stored_name)

    size = 0
    with open(stored_path, "wb") as f:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > settings.max_upload_size_bytes:
                f.close()
                os.remove(stored_path)
                max_mb = settings.max_upload_size_bytes // (1024 * 1024)
                raise HTTPException(status_code=413, detail=f"File exceeds the {max_mb}MB upload limit")
            f.write(chunk)

    if size == 0:
        os.remove(stored_path)
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    return stored_path