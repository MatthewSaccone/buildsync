import os
import uuid

from fastapi import HTTPException, UploadFile

from app.core.config import settings

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
PDF_EXTENSIONS = {".pdf"}
DOCUMENT_EXTENSIONS = {".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv"}
SHEET_EXTENSIONS = IMAGE_EXTENSIONS | {".pdf"}
# Everything allowed as a chat attachment: photos, PDFs, and common office documents.
CHAT_ATTACHMENT_EXTENSIONS = IMAGE_EXTENSIONS | PDF_EXTENSIONS | DOCUMENT_EXTENSIONS


def save_upload(file: UploadFile, allowed_extensions: set[str]) -> str:
    """Validates extension + size, writes to disk, returns the stored file path."""
    stored_path, _, _ = save_upload_with_metadata(file, allowed_extensions)
    return stored_path


def save_upload_with_metadata(file: UploadFile, allowed_extensions: set[str]) -> tuple[str, str, str | None]:
    """Same as save_upload, but also returns the original filename and content
    type so callers (e.g. chat attachments) can preserve them for display and
    download, since the on-disk filename is a randomized UUID."""
    original_name = file.filename or "upload"
    ext = os.path.splitext(original_name)[1].lower()
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

    return stored_path, original_name, file.content_type
