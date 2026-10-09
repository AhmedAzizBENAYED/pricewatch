"""recreate_snapshots

Revision ID: e7f8a9b1c2d3
Revises: c3f8a2d1e9b7
Create Date: 2026-04-13 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e7f8a9b1c2d3'
down_revision: Union[str, None] = 'c3f8a2d1e9b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('snapshots')

    op.create_table('snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('offre_id', sa.Integer(), nullable=False),
        sa.Column('nom', sa.String(length=255), nullable=True),
        sa.Column('marque', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('prix_original', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('prix_promotion', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('image', sa.String(length=500), nullable=True),
        sa.Column('stock_status', sa.String(length=50), nullable=True),
        sa.Column('offre_brute', sa.JSON(), nullable=True),
        sa.Column('score_qualite', sa.Float(), nullable=True),
        sa.Column('date_debut_observation', sa.DateTime(timezone=True), nullable=False),
        sa.Column('date_fin_observation', sa.DateTime(timezone=True), nullable=True),
        sa.Column('nb_observations_identiques', sa.Integer(), nullable=False, server_default='1'),
        sa.ForeignKeyConstraint(['offre_id'], ['offres_normalisees.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # Index for the common query: find open snapshot for a given offer
    op.create_index('ix_snapshots_offre_id', 'snapshots', ['offre_id'])
    op.create_index('ix_snapshots_open', 'snapshots', ['offre_id', 'date_fin_observation'])

    # Backfill: one open snapshot per existing offer
    op.execute("""
        INSERT INTO snapshots (
            offre_id, nom, prix_original, prix_promotion,
            image, stock_status, offre_brute,
            date_debut_observation, nb_observations_identiques
        )
        SELECT
            id, nom, prix_original, prix_en_promotion,
            image, statut_stock, offre_brute,
            NOW(), 1
        FROM offres_normalisees
    """)


def downgrade() -> None:
    op.drop_index('ix_snapshots_open', table_name='snapshots')
    op.drop_index('ix_snapshots_offre_id', table_name='snapshots')
    op.drop_table('snapshots')

    # Restore the original table as it was after the initial migration + 5acbf4d4c215
    op.create_table('snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('offre_id', sa.Integer(), nullable=True),
        sa.Column('nom', sa.String(length=255), nullable=True),
        sa.Column('marque', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('prix_original', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('prix_promotion', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('image', sa.String(length=500), nullable=True),
        sa.Column('stock_status', sa.String(length=50), nullable=True),
        sa.Column('offre_brute', sa.JSON(), nullable=True),
        sa.Column('score_qualite', sa.Float(), nullable=True),
        sa.Column('date_debut_observation', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('date_fin_observation', sa.DateTime(), nullable=True),
        sa.Column('nb_observations_identiques', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['offre_id'], ['offres_normalisees.id']),
        sa.PrimaryKeyConstraint('id'),
    )