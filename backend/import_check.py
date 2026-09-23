"""Verify the backend app imports cleanly (import check).

Run: .venv/bin/python import_check.py
"""
from app.main import app  # noqa: F401
from app.models import Base  # noqa: F401
from app.schemas import (  # noqa: F401
    CatalogItem, CompanyIn, CompanyOut, DealCreate, DealOut,
    DeviceSchemaIn, HealthOut, ListingIn, ListingOut, ReviewIn,
)
print("IMPORT_OK app imported, title=%s" % app.title)
