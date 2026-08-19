"""A SQLAlchemy column type that encrypts on write and decrypts on read,
so model code and routers never handle ciphertext directly -- they just
read/write user.phone or project.address like any other string column."""
from sqlalchemy import String, TypeDecorator

from app.core.crypto import encrypt_field, decrypt_field


class EncryptedString(TypeDecorator):
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt_field(value)

    def process_result_value(self, value, dialect):
        return decrypt_field(value)