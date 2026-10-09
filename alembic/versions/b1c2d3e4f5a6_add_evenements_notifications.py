"""add evenements and notifications tables

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5a6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'evenements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('offre_id', sa.Integer(), nullable=False),
        sa.Column('type_evenement', sa.String(length=50), nullable=False),
        sa.Column('valeur_avant', sa.Numeric(precision=10, scale=3), nullable=True),
        sa.Column('valeur_apres', sa.Numeric(precision=10, scale=3), nullable=True),
        sa.Column('date_detection', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['offre_id'], ['offres_normalisees.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_evenements_offre_id', 'evenements', ['offre_id'])
    op.create_index('ix_evenements_date', 'evenements', [sa.text('date_detection DESC')])
    op.create_index('ix_evenements_type', 'evenements', ['type_evenement'])

    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('id_utilisateur', sa.Integer(), nullable=False),
        sa.Column('evenement_id', sa.Integer(), nullable=False),
        sa.Column('lu', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['id_utilisateur'], ['utilisateurs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['evenement_id'], ['evenements.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notif_user', 'notifications', ['id_utilisateur'])
    op.create_index('ix_notif_lu', 'notifications', ['id_utilisateur', 'lu'])


def downgrade():
    op.drop_index('ix_notif_lu', table_name='notifications')
    op.drop_index('ix_notif_user', table_name='notifications')
    op.drop_table('notifications')
    op.drop_index('ix_evenements_type', table_name='evenements')
    op.drop_index('ix_evenements_date', table_name='evenements')
    op.drop_index('ix_evenements_offre_id', table_name='evenements')
    op.drop_table('evenements')
