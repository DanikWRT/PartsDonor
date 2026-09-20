"""InvenTree-клиент — прямой REST API (httpx).

InvenTree = source of truth инвентаря. Ходим напрямую к REST API с токеном
(Authorization: Token <key>) — это стабильнее, чем классы `inventree` SDK,
которые меняют API между версиями (классы 0.23 переименованы).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

log = logging.getLogger("partsdonor.inventree")


class InventreeClient:
    """Тонкий REST-клиент InvenTree. Эндпоинты: /api/part/, /api/stock/, /api/company/..."""

    def __init__(self) -> None:
        self.base_url = settings.inventree_base_url.rstrip("/")
        self.token = settings.inventree_token

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Token {self.token}"}

    def _url(self, path: str) -> str:
        return f"{self.base_url}/api/{path.lstrip('/')}"

    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        resp = httpx.request(method, self._url(path), headers=self._headers(), timeout=20.0, **kwargs)
        if resp.status_code >= 400:
            log.error("InvenTree %s %s -> %s %s", method, path, resp.status_code, resp.text[:200])
            resp.raise_for_status()
        return resp.json()

    def health(self) -> bool:
        try:
            r = httpx.get(self.base_url, timeout=8.0, headers=self._headers())
            return r.status_code < 500
        except Exception:  # noqa: BLE001
            return False

    # --- категории ---
    def _paginate(self, data: Any) -> list:
        """InvenTree отдаёт голый список, когда мало данных, или {results: [...]} при пагинации."""
        if isinstance(data, dict):
            return data.get("results", []) if isinstance(data.get("results"), list) else []
        if isinstance(data, list):
            return data
        return []

    def list_categories(self, **filters: Any) -> list[dict]:
        return self._paginate(self.request("GET", "part/category/", params=filters))

    def create_category(self, name: str, parent: int | None = None, **extra: Any) -> dict:
        body: dict[str, Any] = {"name": name}
        if parent:
            body["parent"] = parent
        body.update(extra)
        return self.request("POST", "part/category/", json=body)

    # --- части (запчасти/донор) ---
    def list_parts(self, **filters: Any) -> list[dict]:
        return self._paginate(self.request("GET", "part/", params=filters))

    def create_part(self, name: str, category: int | None = None, ipn: str = "",
                    description: str = "", **extra: Any) -> dict:
        body: dict[str, Any] = {"name": name, "description": description}
        if category:
            body["category"] = category
        if ipn:
            body["IPN"] = ipn
        body.update(extra)
        return self.request("POST", "part/", json=body)

    def update_part(self, part_id: int, **fields: Any) -> dict:
        return self.request("PATCH", f"part/{part_id}/", json=fields)

    # --- stock (экземпляры на складе) ---
    def list_stock(self, **filters: Any) -> list[dict]:
        return self._paginate(self.request("GET", "stock/", params=filters))

    def create_stock(self, part: int, quantity: float = 1, **extra: Any) -> dict:
        body: dict[str, Any] = {"part": part, "quantity": quantity}
        body.update(extra)
        return self.request("POST", "stock/", json=body)

    # --- BOM (структура донора: родитель -> дочерние части xN) ---
    def list_bom_items(self, part: int) -> list[dict]:
        return self._paginate(self.request("GET", "bom/", params={"part": part}))

    def create_bom_item(self, parent_part: int, sub_part: int, quantity: float = 1,
                        reference: str = "") -> dict:
        body: dict[str, Any] = {
            "part": parent_part,
            "sub_part": sub_part,
            "quantity": quantity,
            "reference": reference,
        }
        return self.request("POST", "bom/", json=body)

    # --- компании / адреса ---
    def list_companies(self, **filters: Any) -> list[dict]:
        return self._paginate(self.request("GET", "company/", params=filters))

    # --- вложения (фото) ---
    def create_attachment(self, part: int, name: str, file_url: str) -> dict:
        return self.request("POST", "attachment/", json={"part": part, "name": name, "link": file_url})


inventree = InventreeClient()
