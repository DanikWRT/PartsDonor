"""PERF-2 concurrency latency probe.

Fires 20 PARALLEL GET /catalog requests and reports min/p50/p95 latency.
Run against the fresh backend, e.g.:
  /home/aifactory/PartsDonor/backend/.venv/bin/python _perf2_latency_probe.py 8027
"""
import asyncio
import statistics
import sys
import time

import httpx

PORT = sys.argv[1] if len(sys.argv) > 1 else "8027"
BASE = f"http://127.0.0.1:{PORT}"
N = 20


async def once(client: httpx.AsyncClient) -> float:
    t0 = time.perf_counter()
    r = await client.get(f"{BASE}/catalog?limit=50&offset=0")
    assert r.status_code == 200, f"status {r.status_code}"
    return (time.perf_counter() - t0) * 1000.0


async def main() -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        lat = await asyncio.gather(*(once(client) for _ in range(N)))
    lat = sorted(lat)
    p50 = statistics.median(lat)
    p95 = lat[int(0.95 * (len(lat) - 1))]
    print(f"requests={N}  min={lat[0]:.1f}ms  p50={p50:.1f}ms  p95={p95:.1f}ms")
    assert p50 < 1000.0, f"PERF-2 FAIL: median {p50:.1f}ms >= 1s"
    print("PERF-2 LATENCY PROBE: PASS (median < 1s)")


if __name__ == "__main__":
    asyncio.run(main())
