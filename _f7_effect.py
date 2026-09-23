src = open('frontend/src/pages/DonorView.jsx').read()
# print the useEffect block lines 470-493 with structural markers
lines = src.split('\n')
for i in range(469, 494):
    if i < len(lines):
        l = lines[i]
        seg = l.strip()[:90]
        print(i+1, seg, '| stars:', l.count('*'))
