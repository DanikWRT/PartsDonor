"""Sanity: migration module imports and revision id resolves."""
import importlib.util
spec = importlib.util.spec_from_file_location(
    "m", "/home/aifactory/PartsDonor/backend/migrations/versions/6a092294795f_baseline_marketplace_schema_t1.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print("revision:", m.revision, "| down_revision:", m.down_revision)
print("upgrade:", callable(m.upgrade), "| downgrade:", callable(m.downgrade))
