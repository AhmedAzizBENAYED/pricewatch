"""categories_parent_cascade

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'k6l7m8n9o0p1'
down_revision: Union[str, None] = 'j5k6l7m8n9o0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the existing FK on id_parent (no cascade)
    op.drop_constraint('categories_id_parent_fkey', 'categories', type_='foreignkey')
    # Recreate with ON DELETE SET NULL so deleting a parent doesn't block
    op.create_foreign_key(
        'categories_id_parent_fkey',
        'categories', 'categories',
        ['id_parent'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('categories_id_parent_fkey', 'categories', type_='foreignkey')
    op.create_foreign_key(
        'categories_id_parent_fkey',
        'categories', 'categories',
        ['id_parent'], ['id'],
    )