"""candidats.referentiel_id nullable — candidats no longer require a referentiel shell

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-04-23

"""
from alembic import op

revision = 't5u6v7w8x9y0'
down_revision = 's4t5u6v7w8x9'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('candidats', 'referentiel_id', nullable=True)


def downgrade():
    op.alter_column('candidats', 'referentiel_id', nullable=False)