"""PERF-1: check whether InvenTree source is reachable (explains part_name=None)."""
import asyncio
from app.main import _part_info
from app.inventree_client import inventree

async def main():
    for pid in (1, 2, 3, 100):
        try:
            info = await _part_info(pid)
            print("pid", pid, "->", info)
        except Exception as e:  # noqa: BLE001
            print("pid", pid, "EXC", repr(e))
    try:
        r = await inventree.request("GET", "part/")
        print("inventree part/ -> ok, count:", (len(r) if isinstance(r, list) else type(r)))
    except Exception as e:  # noqa: BLE001
        print("inventree part/ EXC:", repr(e))
    try:
        print("inventree health:", await inventree.health())
    except Exception as e:  # noqa: BLE001
        print("inventree health EXC:", repr(e))

asyncio.run(main())
