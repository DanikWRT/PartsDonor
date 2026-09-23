lines = open('frontend/src/pages/DonorView.jsx').read().split('\n')
for i in range(525, 540):
    print(i + 1, repr(lines[i]))
