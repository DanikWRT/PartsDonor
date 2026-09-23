lines = open('frontend/src/pages/DonorView.jsx').read().split('\n')
t = lines[530]
print('len:', len(t))
print('has_backtick:', '`' in t)
print('contains_b:', 'Bearer'.lower() in t.lower())
print('contains_three_asterisks:', t.count('*') >= 3)
print('repr_char_1_20:', [str(ord(c)) for c in t[:18]])
# hex of first 22 chars
print('hex11_22:', ' '.join(f'{ord(c):02x}' for c in t[:14]))
