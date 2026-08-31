"""encrypt phone and address fields

Revision ID: 4d9294c7544d
Revises: 03aca2d63dcb
Create Date: 2026-08-XX

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app.core.encrypted_type


# revision identifiers, used by Alembic.
revision: str = '4d9294c7544d'
down_revision: Union[str, None] = '03aca2d63dcb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('projects') as batch_op:
        batch_op.alter_column('address',
                   existing_type=sa.VARCHAR(length=500),
                   type_=app.core.encrypted_type.EncryptedString(length=1000),
                   existing_nullable=True)
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('phone',
                   existing_type=sa.VARCHAR(length=50),
                   type_=app.core.encrypted_type.EncryptedString(length=255),
                   existing_nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('phone',
                   existing_type=app.core.encrypted_type.EncryptedString(length=255),
                   type_=sa.VARCHAR(length=50),
                   existing_nullable=True)
    with op.batch_alter_table('projects') as batch_op:
        batch_op.alter_column('address',
                   existing_type=app.core.encrypted_type.EncryptedString(length=1000),
                   type_=sa.VARCHAR(length=500),
                   existing_nullable=True)
