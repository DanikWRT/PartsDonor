"""Тесты T1: /health, каталог/донор из InvenTree, listing+deal+escrow flow.

Запуск: cd backend && .venv/bin/pytest test_t1.py -v
Идут по реальному HTTP к запущенному backend (PARTSDONOR_TEST_BASE, по умолчанию
http://127.0.0.1:8101 — тестовый инстанс uvicorn). Требует InvenTree (8000) и
PostgreSQL (5433/partsdonor).
"""

from __future__ import annotations

import os
import uuid

import httpx
import pytest

BASE = os.environ.get("PARTSDONOR_TEST_BASE", "http://127.0.0.1:8101")


@pytest.fixture(scope="module")
def client():
    try:
        c = httpx.Client(base_url=BASE, timeout=15.0)
        c.get("/health").raise_for_status()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"backend недоступен на {BASE}: {exc}")
    return c


def test_health(client):
    data = client.get("/health").json()
    assert data["partsdonor_backend"] == "ok"
    assert data["inventree"] is True
    assert "8000" in data["inventree_base_url"]


def test_catalog_from_inventree(client):
    items = client.get("/catalog").json()
    assert isinstance(items, list) and len(items) > 0
    assert any("iPhone" in i["name"] for i in items)
    items2 = client.get("/catalog", params={"q": "Дисплей"}).json()
    assert any("Дисплей" in i["name"] for i in items2)


def test_donor_from_inventree(client):
    d = client.get("/donor/6").json()
    assert d["model"]
    assert len(d["components"]) >= 1
    assert all("slot" in c and "price_rub" in c for c in d["components"])


def test_listing_deal_escrow_flow(client):
    r = client.post("/companies", json={"name": f"TestShop-{uuid.uuid4().hex[:6]}"})
    assert r.status_code == 201, r.text
    seller_id = r.json()["id"]

    r = client.post(
        "/listings",
        json={
            "title": "Тестовая деталь T1",
            "price_rub": 1500.0,
            "inventree_part_id": 3,
            "seller_id": seller_id,
        },
    )
    assert r.status_code == 201, r.text
    listing = r.json()
    assert listing["status"] == "active"
    listing_id = listing["id"]

    r = client.post(
        "/deals",
        json={
            "listing_id": listing_id,
            "buyer_company_id": seller_id,
            "amount_rub": 1500.0,
        },
    )
    assert r.status_code == 201, r.text
    deal = r.json()
    assert deal["status"] == "created"
    assert deal["escrow_status"] == "created"
    deal_id = deal["id"]

    # статусная машина: created -> paid_escrow -> shipped -> delivered -> completed
    for status, escrow in [
        ("paid_escrow", "paid"),
        ("shipped", "in_progress"),
        ("delivered", "in_progress"),
        ("completed", "released"),
    ]:
        r = client.patch(f"/deals/{deal_id}/status", json={"status": status})
        assert r.status_code == 200, r.text
        assert r.json()["escrow_status"] == escrow

    # недопустимый переход из completed
    r = client.patch(f"/deals/{deal_id}/status", json={"status": "shipped"})
    assert r.status_code == 400

    # листинг ушёл в negotiated после сделки
    assert client.get(f"/listings/{listing_id}").json()["status"] == "negotiated"


def test_review_updates_seller_rating(client):
    r = client.post("/companies", json={"name": f"RateShop-{uuid.uuid4().hex[:6]}"})
    assert r.status_code == 201, r.text
    seller_id = r.json()["id"]
    for rating in (5, 3):
        r = client.post(
            "/reviews", json={"rating": rating, "comment": "ok", "seller_id": seller_id}
        )
        assert r.status_code == 201, r.text
    assert client.get(f"/companies/{seller_id}").json()["rating"] == 4.0
