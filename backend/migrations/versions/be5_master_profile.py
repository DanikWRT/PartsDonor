"""be5_master_profile

Revision ID: be5_master_profile
Revises: be4_kb
Create Date: 2026-09-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be5_master_profile'
down_revision: Union[str, Sequence[str], None] = 'be4_kb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add master_profiles table (профиль мастера, BE-5)."""
    op.create_table(
        'master_profiles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('tagline', sa.String(length=255), nullable=False, server_default=''),
        sa.Column('city', sa.String(length=120), nullable=False, server_default=''),
        sa.Column('since', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('experience', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('services', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('arsenal', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('portfolio', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('b2b', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('contacts', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_master_profiles_company_id'), 'master_profiles', ['company_id'], unique=True)


def downgrade() -> None:
    """Downgrade schema: remove master_profiles table."""
    op.drop_index(op.f('ix_master_profiles_company_id'), table_name='master_profiles')
    op.drop_table('master_profiles')
