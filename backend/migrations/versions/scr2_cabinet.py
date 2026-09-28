"""scr2_cabinet

Revision ID: scr2_cabinet
Revises: be6_storefront_perf
Create Date: 2026-09-26 16:00:00.000000

SCR-2 (кабинет продавца): индексы на часто фильтруемые статусные поля
каталога/сделок — LISTINGS.status и DEAL.status (по PERF-секции Design-System-v2).
Идемпотентно: создаёт только отсутствующие индексы (некоторые могли быть
добавлены предыдущими карточками BE).
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'scr2_cabinet'
down_revision: Union[str, Sequence[str], None] = 'be6_storefront_perf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add perf indexes if missing (idempotent)."""
    bind = op.get_bind()
    insp = inspect(bind)
    listings_idx = {i["name"] for i in insp.get_indexes("listings")}
    deals_idx = {i["name"] for i in insp.get_indexes("deals")}
    if "ix_listings_status" not in listings_idx:
        op.create_index(op.f('ix_listings_status'), 'listings', ['status'], unique=False)
    if "ix_deal_status" not in deals_idx:
        op.create_index(op.f('ix_deal_status'), 'deals', ['status'], unique=False)


def downgrade() -> None:
    """Downgrade schema: drop the added indexes."""
    bind = op.get_bind()
    insp = inspect(bind)
    if "ix_listings_status" in {i["name"] for i in insp.get_indexes("listings")}:
        op.drop_index(op.f('ix_listings_status'), table_name='listings')
    if "ix_deal_status" in {i["name"] for i in insp.get_indexes("deals")}:
        op.drop_index(op.f('ix_deal_status'), table_name='deals')
