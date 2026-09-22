"""Статусная машина сделки (escrow-жизненный цикл, ЮKassa «Безопасная сделка»).

Порядок валидных переходов (по data-model.md / task B6):
    created → escrow_paid → seller_confirmed → shipped → delivered
            → buyer_confirmed → payout → completed
Плюс боковые ветки: refund (возврат покупателю) и dispute (спор/арбитраж).
Недопустимый переход → ValueError (роут превращает его в 4xx).
"""

from __future__ import annotations

from app.models import DealStatus, EscrowStatus

# Допустимые переходы: from -> {to, ...}
TRANSITIONS: dict[DealStatus, set[DealStatus]] = {
    DealStatus.created: {DealStatus.escrow_paid, DealStatus.refunded, DealStatus.dispute},
    DealStatus.escrow_paid: {
        DealStatus.seller_confirmed,
        DealStatus.refunded,
        DealStatus.dispute,
    },
    DealStatus.seller_confirmed: {DealStatus.shipped, DealStatus.dispute},
    DealStatus.shipped: {DealStatus.delivered, DealStatus.dispute},
    DealStatus.delivered: {
        DealStatus.buyer_confirmed,
        DealStatus.refunded,
        DealStatus.dispute,
    },
    DealStatus.buyer_confirmed: {DealStatus.payout},
    DealStatus.payout: {DealStatus.completed},
    DealStatus.completed: set(),
    DealStatus.refunded: set(),
    DealStatus.dispute: {DealStatus.refunded, DealStatus.delivered},
}

# Сопоставление статуса сделки → escrow-статус ЮKassa (заготовка).
ESCROW_BY_DEAL: dict[DealStatus, EscrowStatus] = {
    DealStatus.created: EscrowStatus.created,
    DealStatus.escrow_paid: EscrowStatus.paid,
    DealStatus.seller_confirmed: EscrowStatus.in_progress,
    DealStatus.shipped: EscrowStatus.in_progress,
    DealStatus.delivered: EscrowStatus.in_progress,
    DealStatus.buyer_confirmed: EscrowStatus.in_progress,
    DealStatus.payout: EscrowStatus.released,
    DealStatus.completed: EscrowStatus.released,
    DealStatus.refunded: EscrowStatus.refunded,
    DealStatus.dispute: EscrowStatus.in_progress,
}


def validate_transition(from_status: DealStatus, to_status: DealStatus) -> bool:
    """Проверить допустимость перехода. Недопустимый → ValueError с внятным текстом."""
    allowed = TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        raise ValueError(
            f"Недопустимый переход статуса сделки: {from_status.value} -> {to_status.value}"
        )
    return True


__all__ = ["TRANSITIONS", "ESCROW_BY_DEAL", "validate_transition"]
