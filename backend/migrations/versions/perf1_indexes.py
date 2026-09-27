'''perf1_indexes — index on listings.inventree_part_id (PERF-1)

Revision ID: perf1_indexes
Revises: be6_storefront_perf
Create Date: 2026-09-28 00:00:00.000000

PERF-1: N+1 / index work. The only genuinely missing task-required index is
listings.inventree_part_id (all others already exist). This migration creates it
idempotently (guarded against the shared DB), following the be6 pattern.
'''
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'perf1_indexes'
down_revision: Union[str, Sequence[str], None] = 'be6_storefront_perf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_indexes(conn, table: str) -> set[str]:
    """Возвращает множество имён индексов таблицы в текущей БД."""
    rows = conn.execute(
        sa.text("SELECT indexname FROM pg_indexes WHERE tablename = :t")
        .bindparams(t=table)
    )
    return {r[0] for r in rows}


def upgrade() -> None:
    """Idempotently create listings(inventree_part_id) index if not present."""
    conn = op.get_bind()
    if "ix_listings_inventree_part_id" not in _existing_indexes(conn, "listings"):
        op.create_index("ix_listings_inventree_part_id", "listings", ["inventree_part_id"])


def downgrade() -> None:
    """Drop the index only if it exists."""
    conn = op.get_bind()
    if "ix_listings_inventree_part_id" in _existing_indexes(conn, "listings"):
        op.drop_index("ix_listings_inventree_part_id", table_name="listings")
