# Векторні шматки мапи для чіткого наближення (z7+): трикутники мінікарти, поділені на клітинки 800x800 м.
# Запуск: python3 scripts/map-chunks.py public/map/v  (у папці з tris.pkl — трикутниками з експорту OpenHydra)
# Файл клітинки: u32 n, n*6 u16 координат у чвертях метра від (X0, YT) (x вправо, y вниз), n u8 індексів кольору.
import pickle, numpy as np, os, sys, json
X0, YT, SIZE, CELL, Q = -5996.0, 8470.0, 12800.0, 800.0, 4
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
tris = pickle.load(open('tris.pkl', 'rb'))
P = np.concatenate([np.stack([(T[..., 0] - X0), (YT - T[..., 1])], -1) for _, _, T, _ in tris])
C = np.concatenate([c for *_, c in tris]).astype(int)
pal, ci = np.unique(C, axis=0, return_inverse=True); ci = ci.reshape(-1)
P = np.clip(P, 0, SIZE - 0.01)
U = np.round(P * Q).astype(np.uint16)
n = int(SIZE // CELL)
mn = P.min(1) // CELL; mx = P.max(1) // CELL
cells = {}
for i in range(len(P)):
    for cx in range(int(mn[i, 0]), int(mx[i, 0]) + 1):
        for cy in range(int(mn[i, 1]), int(mx[i, 1]) + 1):
            cells.setdefault((cx, cy), []).append(i)
tot = 0; have = []
for (cx, cy), ids in cells.items():
    ids = np.array(sorted(ids))
    with open(f'{OUT}/{cx}_{cy}.bin', 'wb') as f:
        f.write(np.uint32(len(ids)).tobytes()); f.write(U[ids].reshape(-1).astype('<u2').tobytes()); f.write(ci[ids].astype(np.uint8).tobytes())
    tot += os.path.getsize(f'{OUT}/{cx}_{cy}.bin'); have.append(cx * n + cy)
json.dump({'cell': CELL, 'q': Q, 'n': n, 'palette': ['#%02x%02x%02x' % tuple(c) for c in pal], 'have': sorted(have)}, open(f'{OUT}/index.json', 'w'), separators=(',', ':'))
print('cells', len(cells), 'tris', len(P), 'bytes', tot, 'max', max(len(v) for v in cells.values()))
