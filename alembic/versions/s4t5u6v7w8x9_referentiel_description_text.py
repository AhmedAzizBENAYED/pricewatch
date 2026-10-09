"""change referentiels.description from varchar(1000) to text

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
Create Date: 2026-04-21

"""
from alembic import op
import sqlalchemy as sa

revision = 's4t5u6v7w8x9'
down_revision = 'r3s4t5u6v7w8'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'referentiels', 'description',
        type_=sa.Text(),
        existing_type=sa.String(1000),
        existing_nullable=True,
    )


def downgrade():
    op.alter_column(
        'referentiels', 'description',
        type_=sa.String(1000),
        existing_type=sa.Text(),
        existing_nullable=True,
        postgresql_using='description::varchar(1000)',
    )