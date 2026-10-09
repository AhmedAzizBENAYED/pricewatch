"""drop redundant columns from snapshots (nom, marque, description, image)

Revision ID: p1q2r3s4t5u6
Revises: o0p1q2r3s4t5
Create Date: 2026-04-21

"""
from alembic import op
import sqlalchemy as sa

revision = 'p1q2r3s4t5u6'
down_revision = 'o0p1q2r3s4t5'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('snapshots', 'nom')
    op.drop_column('snapshots', 'marque')
    op.drop_column('snapshots', 'description')
    op.drop_column('snapshots', 'image')


def downgrade():
    op.add_column('snapshots', sa.Column('image',       sa.String(500), nullable=True))
    op.add_column('snapshots', sa.Column('description', sa.Text(),      nullable=True))
    op.add_column('snapshots', sa.Column('marque',      sa.String(100), nullable=True))
    op.add_column('snapshots', sa.Column('nom',         sa.String(255), nullable=True))