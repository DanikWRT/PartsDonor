import re
for path in ['frontend/src/pages/DonorView.jsx','frontend/src/pages/Deal.jsx']:
    src = open(path).read()
    print('=====', path)
    # find all Authorization: ... lines structurally
    for m in re.finditer(r'Authorization\s*:\s*([^\n]*)', src):
        seg = m.group(1)
        ok_bearer = 'Bearer' in seg and '`' in seg and seg.count('*') < 3
        print('  hasBearer:', 'Bearer' in seg, 'backtick:', '`' in seg, 'stars:', seg.count('*'), 'len:', len(seg))
