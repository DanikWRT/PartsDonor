import json, urllib.request

def get(u):
    return json.load(urllib.request.urlopen(u, timeout=20))

schemas = get("http://127.0.0.1:5173/api/device-schemas")
schema = [s for s in schemas if str(s.get('model',''))=='iPhone 13 Pro'][0]
calld = get("http://127.0.0.1:5173/api/donor/6")

def normalizeSlot(raw):
    s = str(raw or '')
    if 'Дисплей' in s: return 'display'
    if 'Материнск' in s or 'Плата' in s: return 'board'
    if 'Аккумулятор' in s: return 'battery'
    if 'Камера' in s: return 'camera'
    if 'Корпус' in s: return 'backcover'
    return None

hotspots = schema.get('hotspots') or {}
print("schema hotspots keys:", list(hotspots.keys()))
for c in calld['components']:
    slotKey = normalizeSlot(c.get('slot')) or normalizeSlot(c.get('title')) or c.get('slot')
    sc = hotspots.get(slotKey) or c.get('hotspot')
    y = sc.get('y') if isinstance(sc, dict) else None
    print(f"  slot='{c.get('slot')}' slotKey={slotKey!r} schemaKey={json.dumps(sc)} y={y}")
