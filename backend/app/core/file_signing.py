"""Short-lived, signed URLs for serving uploaded files, bound to the
specific user and resource they were issued for. See module docstring
history: files can't be protected by a normal Authorization header check
since they're rendered via plain <img src="..."> tags, which browsers
don't attach auth headers to. The signature proves the link was issued
by the backend for a specific (user, resource) pair -- it does not prove
the browser making the request IS that user, since there's no way to
authenticate a plain image request. What it DOES protect against: guessed
filenames, tampered URLs, and a user who's since been removed from the
project still being able to use an already-issued link past that point.
A leaked/shared link still works for whoever has it, within the 5-minute
TTL -- that's an inherent limit of this pattern, not a gap in the signing.
"""
import hashlib
import hmac
import time
import os

from app.core.config import settings

SIGNATURE_TTL_SECONDS = 300


def sign_file_path(relative_path: str, user_id: int) -> tuple[str, str]:
    expires = str(int(time.time()) + SIGNATURE_TTL_SECONDS)
    message = f"{relative_path}:{user_id}:{expires}".encode()
    signature = hmac.new(settings.secret_key.encode(), message, hashlib.sha256).hexdigest()
    return expires, signature


def verify_file_signature(relative_path: str, user_id: int, expires: str, signature: str) -> bool:
    try:
        if int(expires) < int(time.time()):
            return False
    except ValueError:
        return False
    message = f"{relative_path}:{user_id}:{expires}".encode()
    expected = hmac.new(settings.secret_key.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def build_file_url(file_path: str, user_id: int) -> str:
    filename = os.path.basename(file_path)
    expires, signature = sign_file_path(filename, user_id)
    return f"/files/{filename}?user_id={user_id}&expires={expires}&signature={signature}"
