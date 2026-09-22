"""ЮKassa (Безопасная сделка) — клиент и проверка подлинности вебхуков.

Слой интеграции с ЮKassa API v3:
  - create_safe_deal_payment() — создание платежа «на холд» (Безопасная сделка).
    Деньги замораживаются ЮKassa до выплаты продавцу / возврата покупателю.
  - verify_webhook_signature() — HMAC-SHA256 (base64) по телу запроса на секрете
    уведомлений с constant-time сравнением.
  - sender_ip_allowed() — проверка IP отправителя по опубликованным ЮKassa
    подсетям (185.71.76.0/27, 77.75.153.0/25, ...).

Тестовый режим (settings.yookassa_test_mode): при отсутствии секретов боевого API
не ходим в сеть — возвращаем синтетический объект платежа той же формы, чтобы
интеграция и приёмка проходили без живого магазина ЮKassa.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import logging
import uuid
from typing import Any

import httpx

from app.config import settings

log = logging.getLogger("partsdonor.yookassa")

# Опубликованные ЮKassa подсети, с которых могут приходить уведомления.
YOOKASSA_SENDER_NETS: tuple[str, ...] = (
    "185.71.76.0/27",
    "185.71.77.0/27",
    "77.75.153.0/25",
    "77.75.156.11",
    "77.75.156.35",
    "77.75.154.128/25",
    "2a02:5180::/32",
)


class YookassaClient:
    """Тонкий REST-клиент ЮKassa (HTTP Basic Auth shopId + secret)."""

    def __init__(self) -> None:
        self.base_url = settings.yookassa_base_url.rstrip("/")
        self.shop_id = settings.yookassa_shop_id
        self.secret_key = settings.yookassa_secret_key
        self.test_mode = settings.yookassa_test_mode

    @property
    def configured(self) -> bool:
        """Есть ли ключи боевого/тестового магазина для реального вызова API."""
        return bool(self.shop_id and self.secret_key)

    def _auth(self) -> tuple[str, str] | None:
        if not self.configured:
            return None
        return (self.shop_id, self.secret_key)

    def create_safe_deal_payment(
        self,
        *,
        amount_rub: float,
        deal_id: str,
        payment_id: str,
        return_url: str,
        description: str = "PartsDonor Безопасная сделка",
    ) -> dict[str, Any]:
        """Создать платёж «на холд» в ЮKassa (Безопасная сделка).

        body: amount + capture:true + deal (ссылка на сделку) + metadata с нашим
        deal_id. В тестовом режиме без ключей — возвращаем синтетический объект
        платежа той же формы (id, status, confirmation_url, test=true).
        """
        body: dict[str, Any] = {
            "amount": {
                "value": f"{amount_rub:.2f}",
                "currency": "RUB",
            },
            "capture": True,  # холд + автозахват при подтверждении оплаты карты
            "confirmation": {"type": "redirect", "return_url": return_url},
            "description": description,
            "metadata": {"partsdonor_deal_id": deal_id, "payment_id": payment_id},
            "deal": {
                "id": deal_id,  # id нашей сделки (Безопасная сделка ЮKassa)
                "settlements": [
                    {
                        "type": "payout",
                        # средства продавцу перечисляются при закрытии сделки
                        "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
                    }
                ],
            },
        }
        if self.test_mode and not self.configured:
            return self._synthetic_payment(payment_id, amount_rub, deal_id)

        auth = self._auth()
        if auth is None:  # pragma: no cover — не достижимо из-за ветки выше
            return self._synthetic_payment(payment_id, amount_rub, deal_id)

        resp = httpx.post(
            f"{self.base_url}/payments",
            json=body,
            auth=auth,
            headers={"Idempotence-Key": payment_id, "Content-Type": "application/json"},
            timeout=20.0,
        )
        if resp.status_code >= 400:
            log.error("ЮKassa create payment -> %s %s", resp.status_code, resp.text[:300])
            resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _synthetic_payment(
        payment_id: str, amount_rub: float, deal_id: str
    ) -> dict[str, Any]:
        """Синтетический объект платежа (тестовый режим без живых ключей ЮKassa)."""
        return {
            "id": payment_id,
            "status": "pending",
            "paid": False,
            "amount": {"value": f"{amount_rub:.2f}", "currency": "RUB"},
            "confirmation": {
                "type": "redirect",
                "confirmation_url": (
                    f"https://yookassa.ru/test-payment/{deal_id}?pay={payment_id}"
                ),
            },
            "capture": True,
            "description": "PartsDonor Безопасная сделка (тест)",
            "metadata": {"partsdonor_deal_id": deal_id, "payment_id": payment_id},
            "test": True,
        }

    # --- подлинность уведомлений (вебхуков) ---

    @staticmethod
    def verify_webhook_signature(
        raw_body: bytes, provided: str | None, secret: str | None
    ) -> bool:
        """Проверить HMAC-SHA256 (base64) по телу запроса на секрете уведомлений.

        ЮKassa подписывает тело уведомления секретом уведомлений (webhook secret);
        подпись передаётся в заголовке. Используем constant-time сравнение.
        Пустой/отсутствующий секрет считается «проверка отключена» и возвращает False
        (если вебхук реально включён, секрет обязан быть задан).
        """
        if not secret or not provided:
            return False
        expected = hmac.new(
            secret.encode(), raw_body, hashlib.sha256
        ).digest()
        expected_b64 = base64.b64encode(expected).decode()
        return hmac.compare_digest(expected_b64, provided)

    @staticmethod
    def sender_ip_allowed(ip: str | None) -> bool:
        """Разрешён ли IP отправителя уведомления (по подсетям ЮKassa).

        В боевом режиме — только официальные подсети ЮKassa. В тестовом режиме
        (settings.yookassa_test_mode) дополнительно допускаем loopback (127.0.0.1),
        чтобы прогонять вебхук локально, но HMAC-подпись проверяется всегда.
        """
        if not ip:
            return False
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        if settings.yookassa_test_mode and addr.is_loopback:
            return True
        for net in YOOKASSA_SENDER_NETS:
            try:
                if addr in ipaddress.ip_network(net, strict=False):
                    return True
            except ValueError:
                continue
        return False

    @staticmethod
    def parse_notification(body: dict[str, Any]) -> tuple[str | None, dict | None]:
        """Извлечь (event, object) из тела уведомления ЮKassa.

        Ожидается форма {type: 'notification', event: 'payment.succeeded',
        object: {...}}. Невалидное → (None, None).
        """
        if not isinstance(body, dict) or body.get("type") != "notification":
            return (None, None)
        event = body.get("event")
        obj = body.get("object")
        if not isinstance(event, str) or not isinstance(obj, dict):
            return (None, None)
        return (event, obj)


# Единственный экземпляр (как inventree в inventree_client.py)
yookassa = YookassaClient()


def new_payment_id() -> str:
    """Idempotence-key / id платежа (наш внутренний, тест — UUID8)."""
    return f"pay-{uuid.uuid4().hex[:24]}"


__all__ = [
    "YookassaClient",
    "yookassa",
    "new_payment_id",
    "YOOKASSA_SENDER_NETS",
]
