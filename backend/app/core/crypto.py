"""Application-level (Fernet/AES) encryption for columns that don't need to
be searched or indexed -- phone numbers, addresses. Deliberately NOT used for
User.email, since it's unique-indexed for login lookups and encrypting it
would either break exact-match queries or require weaker deterministic
encryption; Supabase's disk-level at-rest encryption already covers email.

FIELD_ENCRYPTION_KEY must be a 32-byte urlsafe-base64 Fernet key, generated
once and kept stable -- rotating it makes existing encrypted values
unreadable unless you migrate them first.
"""
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not settings.field_encryption_key:
            raise RuntimeError(
                "FIELD_ENCRYPTION_KEY is not set. Generate one with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _fernet = Fernet(settings.field_encryption_key.encode())
    return _fernet


def encrypt_field(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_field(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        # Value predates encryption being enabled, or the key rotated --
        # fail loud rather than silently showing garbage/ciphertext to the user.
        raise RuntimeError("Could not decrypt field -- wrong key or unencrypted legacy value")
