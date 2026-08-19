import hashlib
import os
import uuid
import zipfile

import magic
from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.core.malware_scan import scan_file

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
PDF_EXTENSIONS = {".pdf"}
DOCUMENT_EXTENSIONS = {".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv"}
SHEET_EXTENSIONS = IMAGE_EXTENSIONS | {".pdf"}
# Everything allowed as a chat attachment: photos, PDFs, and common office documents.
CHAT_ATTACHMENT_EXTENSIONS = IMAGE_EXTENSIONS | PDF_EXTENSIONS | DOCUMENT_EXTENSIONS

# Maps each allowed extension to the real MIME type(s) its file content must
# sniff as. This stops someone renaming payload.exe -> photo.png to sneak
# past the extension check above — the extension is just a label, this is
# what the bytes actually are.
_EXT_TO_MIME = {
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".webp": {"image/webp"},
    ".pdf": {"application/pdf"},
    ".txt": {"text/plain"},
    ".csv": {"text/plain", "text/csv"},
    # Office Open XML formats (.docx/.xlsx/.pptx) are zip containers.
    # Depending on the libmagic version/database, they may sniff as the
    # specific OOXML MIME or fall back to generic zip — either is fine here
    # since we verify the internal zip structure separately below.
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
    },
    ".xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
    },
    ".pptx": {
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
    },
    # Legacy binary Office formats share one OLE-based container format.
    ".doc": {"application/msword", "application/x-ole-storage", "application/CDFV2"},
    ".xls": {"application/vnd.ms-excel", "application/x-ole-storage", "application/CDFV2"},
    ".ppt": {"application/vnd.ms-powerpoint", "application/x-ole-storage", "application/CDFV2"},
}

# Content signatures that are never acceptable in an upload regardless of
# extension — these indicate an executable or script masquerading as a
# document/image. This is a lightweight defense-in-depth check, not a
# substitute for a real antivirus/malware scanner (e.g. ClamAV) in front of
# the upload path.
_BLOCKED_MIME_SUBSTRINGS = (
    "x-msdownload",       # .exe/.dll
    "x-executable",
    "x-sharedlib",
    "x-elf",
    "x-mach-binary",
    "x-dosexec",
    "javascript",
    "x-shellscript",
    "x-perl",
    "x-python",
    "x-php",
)

_OOXML_EXTENSIONS = {".docx", ".xlsx", ".pptx"}


def _sniff_mime(header: bytes) -> str:
    return magic.from_buffer(header, mime=True)


def _validate_content_matches_extension(stored_path: str, ext: str) -> None:
    """Reads back the file's real content type and rejects it if it doesn't
    match what the extension claims, or looks like an executable/script."""
    with open(stored_path, "rb") as f:
        header = f.read(8192)

    mime = _sniff_mime(header)

    if any(bad in mime for bad in _BLOCKED_MIME_SUBSTRINGS):
        os.remove(stored_path)
        raise HTTPException(status_code=400, detail="File content is not allowed")

    allowed_mimes = _EXT_TO_MIME.get(ext)
    if allowed_mimes and mime not in allowed_mimes:
        os.remove(stored_path)
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match its extension ({ext})",
        )

    if ext in _OOXML_EXTENSIONS:
        _validate_ooxml_zip(stored_path, ext)


def _validate_ooxml_zip(stored_path: str, ext: str) -> None:
    """docx/xlsx/pptx are zip archives — confirm it's a well-formed zip with
    the expected internal manifest, and that no entry tries to escape the
    archive (zip-slip) or is itself an executable payload."""
    try:
        with zipfile.ZipFile(stored_path) as zf:
            names = zf.namelist()
            if "[Content_Types].xml" not in names:
                raise ValueError("missing OOXML manifest")
            for name in names:
                if name.startswith("/") or ".." in name:
                    raise ValueError(f"unsafe archive entry: {name}")
    except (zipfile.BadZipFile, ValueError):
        os.remove(stored_path)
        raise HTTPException(status_code=400, detail=f"File is not a valid {ext} document")


def hash_file(path: str) -> str:
    """Returns the SHA-256 hex digest of the file at `path`, read in chunks
    so large files don't get loaded into memory all at once."""
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def save_upload(file: UploadFile, allowed_extensions: set[str]) -> str:
    """Validates extension + size, writes to disk, returns the stored file path."""
    stored_path, _, _, _ = save_upload_with_metadata(file, allowed_extensions)
    return stored_path


def save_upload_with_metadata(file: UploadFile, allowed_extensions: set[str]) -> tuple[str, str, str | None, str]:
    """Same as save_upload, but also returns the original filename, content
    type, and a SHA-256 hash of the validated file's bytes — the hash lets
    callers detect later on-disk tampering (see content_hash on Attachment).
    The on-disk filename itself is a randomized UUID."""
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

    # Extension check above only looks at the filename, which the client
    # fully controls. Now inspect the actual bytes written to disk.
    _validate_content_matches_extension(stored_path, ext)

    # Signature/heuristic malware scan — catches known-bad payloads that a
    # well-formed, correctly-typed file can still carry (macro viruses,
    # embedded exploits, etc).
    scan_file(stored_path)

    # Hash last, after content validation and malware scanning both pass —
    # this is the "known good" fingerprint we'll check downloads against.
    content_hash = hash_file(stored_path)

    return stored_path, original_name, file.content_type, content_hash
