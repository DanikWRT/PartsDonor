import importlib.util
for name in ['playwright', 'requests']:
    print(name, 'OK' if importlib.util.find_spec(name) else 'MISSING')
