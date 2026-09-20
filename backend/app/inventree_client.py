"""InvenTree-клиент: обёртка над официальным SDK ('inventree').

InvenTree — source of truth инвентаря. Наш торговый слой читает/пишет через
REST API, не трогая схему InvenTree напрямую.

Сниппет: https://pypi.org/project/inventree/  (InventreeAPI, Part, StockItem...)
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings

log = logging.getLogger("partsdonor.inventree")


class InventreeClient:
    """Тонкая обёртка над SDK. Лениво создаёт соединение по токену."""

    def __init__(self) -> None:
        self._api: Any | None = None
        self.base_url = settings.inventree_base_url
        self.token = settings.inventree_token

    def _ensure(self) -> Any:
        if self._api is not None:
            return self._api
        try:
            from inventree.api import InventreeAPI  # noqa: PLC0415
            from inventree.part import Part  # noqa: F401, PLC0415  (проверка импорта)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("inventree SDK не установлен (uv sync)") from exc
        api = InventreeAPI(self.base_url, token=self.token)
        if not api.is_logged_in():
            raise RuntimeError(f"Не удалось пройти аутентификацию в InvenTree ({self.base_url})")
        self._api = api
        return api

    @property
    def api(self) -> Any:
        return self._ensure()

    # --- части (компоненты донора) ---
    def list_parts(self, **filters: Any) -> list[Any]:
        from inventree.part import Part  # noqa: PLC0415
        return Part.list(self.api, **filters)

    def get_part(self, part_id: int) -> Any:
        from inventree.part import Part  # noqa: PLC0415
        return Part(self.api, pk=part_id)

    # --- склад (StockItem) ---
    def list_stock(self, **filters: Any) -> list[Any]:
        from inventree.stock import StockItem  # noqa: PLC0415
        return StockItem.list(self.api, **filters)

    # --- компании (мастерские) ---
    def list_companies(self, **filters: Any) -> list[Any]:
        from inventree.company import Company  # noqa: PLC0415
        return Company.list(self.api, **filters)

    def health(self) -> bool:
        try:
            return bool(self._ensure().is_logged_in())
        except Exception:  # noqa: BLE001
            return False


inventree = InventreeClient()
