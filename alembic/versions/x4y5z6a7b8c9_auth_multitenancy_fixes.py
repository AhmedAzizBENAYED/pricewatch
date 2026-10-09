"""auth and multitenancy fixes

- Create tenant_categories junction table, migrate existing tenant_id data, drop categories.tenant_id
- Add password_hash to utilisateurs and admins
- Widen offres_normalisees.marque to VARCHAR(255)
- Add index on offres_normalisees.categorie_id
- Create caracteristique_cles table IF NOT EXISTS (was created manually in live DB)
- Add specs_normalises / match_layer / match_score columns IF NOT EXISTS (already in live DB)

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa

revision = 'x4y5z6a7b8c9'
down_revision = 'w3x4y5z6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    # ── a) tenant_categories junction table ──────────────────────────────────
    op.create_table(
        'tenant_categories',
        sa.Column('tenant_id',    sa.Integer(), nullable=False),
        sa.Column('categorie_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'],    ['tenants.id'],    ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['categorie_id'], ['categories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('tenant_id', 'categorie_id'),
    )
    op.create_index('ix_tenant_categories_tenant', 'tenant_categories', ['tenant_id'])
    op.create_index('ix_tenant_categories_cat',    'tenant_categories', ['categorie_id'])

    # Migrate existing single-tenant assignments into the junction table
    op.execute("""
        INSERT INTO tenant_categories (tenant_id, categorie_id)
        SELECT tenant_id, id FROM categories
        WHERE tenant_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """)

    # ── b) Drop categories.tenant_id ─────────────────────────────────────────
    op.execute("ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_tenant_id_fkey")
    op.drop_column('categories', 'tenant_id')

    # ── c) password_hash on utilisateurs and admins ──────────────────────────
    op.add_column('utilisateurs', sa.Column('password_hash', sa.String(255), nullable=True))
    op.add_column('admins',       sa.Column('password_hash', sa.String(255), nullable=True))

    # ── d) widen offres_normalisees.marque to VARCHAR(255) ───────────────────
    op.execute("ALTER TABLE offres_normalisees ALTER COLUMN marque TYPE VARCHAR(255)")

    # ── e) index on offres_normalisees.categorie_id ──────────────────────────
    op.create_index('ix_offres_categorie_id', 'offres_normalisees', ['categorie_id'])

    # ── f) caracteristique_cles (already exists in live DB — idempotent) ─────
    op.execute("""
        CREATE TABLE IF NOT EXISTS caracteristique_cles (
            id  SERIAL PRIMARY KEY,
            nom VARCHAR(255) UNIQUE NOT NULL
        )
    """)

    # ── g) normalisation columns (already exist in live DB — idempotent) ─────
    op.execute("ALTER TABLE offres_normalisees ADD COLUMN IF NOT EXISTS specs_normalises JSONB")
    op.execute("ALTER TABLE offres_normalisees ADD COLUMN IF NOT EXISTS match_layer     VARCHAR(50)")
    op.execute("ALTER TABLE offres_normalisees ADD COLUMN IF NOT EXISTS match_score     FLOAT")


def downgrade():
    op.execute("ALTER TABLE offres_normalisees DROP COLUMN IF EXISTS match_score")
    op.execute("ALTER TABLE offres_normalisees DROP COLUMN IF EXISTS match_layer")
    op.execute("ALTER TABLE offres_normalisees DROP COLUMN IF EXISTS specs_normalises")

    op.drop_index('ix_offres_categorie_id', table_name='offres_normalisees')
    op.execute("ALTER TABLE offres_normalisees ALTER COLUMN marque TYPE VARCHAR(100)")

    op.drop_column('admins',       'password_hash')
    op.drop_column('utilisateurs', 'password_hash')

    op.add_column('categories', sa.Column('tenant_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'categories_tenant_id_fkey', 'categories', 'tenants', ['tenant_id'], ['id']
    )
    op.execute("""
        UPDATE categories c
        SET tenant_id = tc.tenant_id
        FROM tenant_categories tc
        WHERE tc.categorie_id = c.id
    """)

    op.drop_index('ix_tenant_categories_cat',    table_name='tenant_categories')
    op.drop_index('ix_tenant_categories_tenant', table_name='tenant_categories')
    op.drop_table('tenant_categories')