"""be6_storefront_perf — perf indexes for storefront/share queries (BE-6)

Revision ID: be6_storefront_perf
Revises: be5_master_profile
Create Date: 2026-09-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be6_storefront_perf'
down_revision: Union[str, Sequence[str], None] = 'be5_master_profile'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_indexes(conn, table: str) -> set[str]:
    """Возвращает множество имён индексов таблицы в текущей БД."""
    rows = conn.execute(
        sa.text("SELECT indexname FROM pg_indexes WHERE tablename = :t")
        .bindparams(t=table)
    )
    return {r[0] for r in rows}


def _create_index(conn, name: str, table: str, columns: list[str]) -> None:
    if name in _existing_indexes(conn, table):
        return
    op.create_index(name, table, columns)


def upgrade() -> None:
    """Add perf indexes on frequently-filtered FK/status columns."""
    conn = op.get_bind()
    _create_index(conn, "ix_listings_seller_id", "listings", ["seller_id"])
    _create_index(conn, "ix_listings_status", "listings", ["status"])
    _create_index(conn, "ix_reviews_seller_id", "reviews", ["seller_id"])
    _create_index(conn, "ix_donor_lots_status", "donor_lots", ["status"])


def downgrade() -> None:
    """Remove the BE-6 perf indexes (only if present)."""
    conn = op.get_bind()
    idx = _existing_indexes(conn, "listings")
    if "ix_listings_seller_id" in idx:
        op.drop_index("ix_listings_seller_id", table_name="listings")
    if "ix_listings_status" in idx:
        op.drop_index("ix_listings_status", table_name="listings")
    idxr = _existing_indexes(conn, "reviews")
    if "ix_reviews_seller_id" in idxr:
        op.drop_index("ix_reviews_seller_id", table_name="reviews")
    idxd = _existing_indexes(conn, "donor_lots")
    if "ix_donor_lots_status" in idxd:
        op.drop_index("ix_donor_lots_status", table_name="donor_lots")
