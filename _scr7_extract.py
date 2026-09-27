import re, html
s = open('/home/aifactory/projects/parsdonor/References/ref-parthub/07-knowledge-base.html', encoding='utf-8').read()
s = re.sub(r'<style.*?</style>', '', s, flags=re.S)
s = re.sub(r'<script.*?</script>', '', s, flags=re.S)
s = re.sub(r'<[^>]+>', '\n', s)
text = html.unescape(s)
lines = [l.rstrip() for l in text.split('\n')]
out = [l for l in lines if l.strip()]
for l in out:
    print(l)
