"""bld3 blueprints

Revision ID: bld3_blueprints
Revises: scr2_cabinet
Create Date: 2026-09-29 03:10:00.000000

BLD-3: create the `blueprints` table — phone scheme (SVG marker + JSON parts
array) bound to a specific brand+model, editable via the constructor.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bld3_blueprints'
down_revision: Union[str, Sequence[str], None] = 'scr2_cabinet'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: create `blueprints` table (idempotent guard)."""
    bind = op.get_bind()
    if sa.inspect(bind).has_table('blueprints'):
        return
    op.create_table(
        'blueprints',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('brand', sa.String(length=64), nullable=False),
        sa.Column('model', sa.String(length=128), nullable=False),
        sa.Column('svg', sa.Text(), nullable=False, server_default=''),
        sa.Column('parts', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema: drop `blueprints` table."""
    op.drop_table('blueprints')
