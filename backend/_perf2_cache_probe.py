"""PERF-2 InvenTree cache probe.

Asserts (no network, no pytest):
  (a) _TTLCache caches a repeated read -> 2nd call hits in-memory, factory NOT invoked.
  (b) single-flight coalesces two concurrent same-key calls into ONE factory invocation.
Prints settings.inventree_cache_ttl_seconds.

Run:  /home/aifactory/PartsDonor/backend/.venv/bin/python _perf2_cache_probe.py
"""
import asyncio

from app.config import settings
from app.inventree_client import _TTLCache

print(f"settings.inventree_cache_ttl_seconds = {settings.inventree_cache_ttl_seconds}")

assert settings.inventree_cache_ttl_seconds > 0, "TTL must be >0 for the in-memory cache"


async def _test_ttl_cache() -> None:
    cache = _TTLCache(ttl=10.0)
    calls = {"n": 0}

    async def factory() -> str:
        calls["n"] += 1
        await asyncio.sleep(0.01)
        return f"value-{calls['n']}"

    key = ("search_parts", (("search", "screen"),))

    # (a) repeated read -> cached, factory invoked once
    r1 = await cache.get_or_set(key, factory)
    r2 = await cache.get_or_set(key, factory)
    assert r1 == r2 == "value-1", f"unexpected cached values {r1!r} / {r2!r}"
    assert calls["n"] == 1, f"(a) FAIL: factory invoked {calls['n']}x for repeated read (expected 1)"

    # (b) single-flight: two concurrent same-key calls -> one factory invocation
    cache2 = _TTLCache(ttl=10.0)
    calls2 = {"n": 0}

    async def factory2() -> int:
        calls2["n"] += 1
        await asyncio.sleep(0.05)
        return calls2["n"]

    key2 = ("list_categories", ())
    res = await asyncio.gather(cache2.get_or_set(key2, factory2), cache2.get_or_set(key2, factory2))
    assert res == [1, 1], f"single-flight returned {res}"
    assert calls2["n"] == 1, f"(b) FAIL: factory invoked {calls2['n']}x for concurrent same-key (expected 1)"

    print("(a) TTL cache hit on repeated read: OK (factory invoked once)")
    print("(b) single-flight coalesces concurrent same-key calls: OK (factory invoked once)")


async def main() -> None:
    try:
        await _test_ttl_cache()
        print("CACHE PROBE: PASS")
    finally:
        # close any lingering client so the process exits cleanly
        try:
            from app import inventree_client  # noqa: F401
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(main())
