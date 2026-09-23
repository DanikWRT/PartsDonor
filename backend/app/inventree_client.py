"""InvenTree-клиент — прямой REST API (httpx, AsyncClient).

InvenTree = source of truth инвентаря. Ходим напрямую к REST API с токеном
(Authorization: Token <key>) — это стабильнее, чем классы `inventree` SDK,
которые меняют API между версиями (классы 0.23 переименованы).

Клиент полностью асинхронный (httpx.AsyncClient), чтобы не блокировать
event-loop FastAPI на сетевых вызовах (таймаут 20с иначе подвешивал воркер).
AsyncClient создаётся лениво при первом запросе (не в момент импорта модуля —
иначе он привязывается не к тому event-loop) и переиспользуется между вызовами.
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
        self._client: httpx.AsyncClient | None = None

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Token {self.token}"}

    def _url(self, path: str) -> str:
        return f"{self.base_url}/api/{path.lstrip('/')}"

    async def _get_client(self) -> httpx.AsyncClient:
        """Ленивое создание AsyncClient (один раз, переиспользуем между вызовами)."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=20.0, headers=self._headers())
        return self._client

    async def request(self, method: str, path: str, **kwargs: Any) -> Any:
        client = await self._get_client()
        resp = await client.request(method, self._url(path), **kwargs)
        if resp.status_code >= 400:
            log.error("InvenTree %s %s -> %s %s", method, path, resp.status_code, resp.text[:200])
            resp.raise_for_status()
        return resp.json()

    async def health(self) -> bool:
        try:
            client = await self._get_client()
            r = await client.get(self.base_url, timeout=8.0)
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

    async def list_categories(self, **filters: Any) -> list[dict]:
        return self._paginate(await self.request("GET", "part/category/", params=filters))

    async def create_category(self, name: str, parent: int | None = None, **extra: Any) -> dict:
        body: dict[str, Any] = {"name": name}
        if parent:
            body["parent"] = parent
        body.update(extra)
        return await self.request("POST", "part/category/", json=body)

    # --- части (запчасти/донор) ---
    async def list_parts(self, **filters: Any) -> list[dict]:
        return self._paginate(await self.request("GET", "part/", params=filters))

    async def get_part(self, part_id: int) -> dict:
        return await self.request("GET", f"part/{part_id}/")

    # Каталог: поиск по имени/описанию/IPN (фильтр ?search=...) + по категории
    async def search_parts(self, *, search: str | None = None, category: int | None = None,
                           assembly: bool | None = None, **extra: Any) -> list[dict]:
        params: dict[str, Any] = {}
        if search:
            params["search"] = search
        if category is not None:
            params["category"] = category
        if assembly is not None:
            params["assembly"] = assembly
        params.update(extra)
        return self._paginate(await self.request("GET", "part/", params=params))

    async def create_part(self, name: str, category: int | None = None, ipn: str = "",
                          description: str = "", **extra: Any) -> dict:
        body: dict[str, Any] = {"name": name, "description": description}
        if category:
            body["category"] = category
        if ipn:
            body["IPN"] = ipn
        body.update(extra)
        return await self.request("POST", "part/", json=body)

    async def update_part(self, part_id: int, **fields: Any) -> dict:
        return await self.request("PATCH", f"part/{part_id}/", json=fields)

    # --- stock (экземпляры на складе) ---
    async def list_stock(self, **filters: Any) -> list[dict]:
        return self._paginate(await self.request("GET", "stock/", params=filters))

    async def create_stock(self, part: int, quantity: float = 1, **extra: Any) -> dict:
        body: dict[str, Any] = {"part": part, "quantity": quantity}
        body.update(extra)
        return await self.request("POST", "stock/", json=body)

    # --- BOM (структура донора: родитель -> дочерние части xN) ---
    async def part_is_assembly(self, part_id: int) -> bool:
        """True если part.assembly=True.

        BOM-родитель обязан быть assembly=True — иначе у парта нет структуры BOM
        (InvenTree не разрешает BOM для не-assembly-партов).
        """
        try:
            part = await self.get_part(part_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("InvenTree part pk=%s недоступен для проверки assembly: %s", part_id, exc)
            return False
        return bool(part.get("assembly"))

    async def list_bom_items(self, part: int) -> list[dict]:
        # BOM-запрос допустим только если родитель assembly=True; иначе возвращаем
        # пустой список и предупреждаем в лог (не полагаемся на проверку в verify-скрипте).
        if not await self.part_is_assembly(part):
            log.warning("InvenTree part pk=%s не assembly=True — BOM не читаем, вернём пустой список", part)
            return []
        return self._paginate(await self.request("GET", "bom/", params={"part": part}))

    async def get_bom_subs(self, donor_part_id: int) -> list[dict]:
        """Список дочерних Part-компонентов донора (через BOM).

        Возвращает компоненты донора: [{part_id, name, quantity}].
        InvenTree BOM item имеет поля `part` (родитель), `sub_part` (компонент),
        `sub_part_detail` (вложенные данные part).

        Пустой список, если донор не assembly=True (проверка в list_bom_items).
        """
        items = await self.list_bom_items(donor_part_id)
        out: list[dict] = []
        for it in items:
            detail = it.get("sub_part_detail") or {}
            part_id = it.get("sub_part") or detail.get("pk")
            cat_detail = detail.get("category_detail") or {}
            out.append({
                "part_id": part_id,
                "name": detail.get("name") or it.get("reference") or str(part_id),
                "quantity": it.get("quantity", 1),
                "category": cat_detail.get("name", "") if cat_detail else "",
            })
        return out

    # --- категории ---
    async def get_category(self, category_id: int) -> dict:
        return await self.request("GET", f"part/category/{category_id}/")

    async def category_name_map(self) -> dict[int, str]:
        """Все категории: {pk: name}."""
        return {c["pk"]: c.get("name", "") for c in await self.list_categories()}

    async def create_bom_item(self, parent_part: int, sub_part: int, quantity: float = 1,
                              reference: str = "") -> dict:
        body: dict[str, Any] = {
            "part": parent_part,
            "sub_part": sub_part,
            "quantity": quantity,
            "reference": reference,
        }
        return await self.request("POST", "bom/", json=body)

    # --- компании / адреса ---
    async def list_companies(self, **filters: Any) -> list[dict]:
        return self._paginate(await self.request("GET", "company/", params=filters))

    # --- вложения (фото) ---
    async def create_attachment(self, part: int, name: str, file_url: str) -> dict:
        return await self.request("POST", "attachment/", json={"part": part, "name": name, "link": file_url})


inventree = InventreeClient()
