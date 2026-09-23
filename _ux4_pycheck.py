import sys
print('PY', sys.version)
try:
    import playwright
    print('python-playwright', playwright.__version__ if hasattr(playwright,'__version__') else 'present')
except Exception as e:
    print('python-playwright MISSING', e)
