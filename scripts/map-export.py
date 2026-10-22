# Дані для «Карти для гри» у проєкції текстур гри: лівий верхній кут (-4140, 8400), 2x3 тайли по 4500 м.
# export.bin — трикутники суші (без моря, як у паку Hydra, де океан прозорий); sea.bin — шар моря з рівнями глибини
# (для minimap_sea). Формат обох: u32 n, n*6 u16 координат у чвертях метра від кута (x вправо, y вниз), n u8 кольорів;
# кольори — у export.json (palette і seaPalette).
# Запуск (у папці з tris.pkl з експорту OpenHydra): python3 scripts/map-export.py public/map/game
import pickle, numpy as np, os, sys, json
GX0, GYT, W, H, Q = -4140.0, 8400.0, 9000.0, 13500.0, 4
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
ALL = pickle.load(open('tris.pkl', 'rb'))

def dump(tris, name):
    P = np.concatenate([np.stack([T[..., 0] - GX0, GYT - T[..., 1]], -1) for _, _, T, _ in tris])
    C = np.concatenate([c for *_, c in tris]).astype(int)
    keep = (P[..., 0].max(1) >= 0) & (P[..., 0].min(1) <= W) & (P[..., 1].max(1) >= 0) & (P[..., 1].min(1) <= H)
    P, C = P[keep], C[keep]
    pal, ci = np.unique(C, axis=0, return_inverse=True)
    U = np.round(np.clip(P, [0, 0], [W, H]) * Q).astype('<u2')
    with open(f'{OUT}/{name}', 'wb') as f:
        f.write(np.uint32(len(U)).tobytes()); f.write(U.reshape(-1).tobytes()); f.write(ci.reshape(-1).astype(np.uint8).tobytes())
    print(name, 'tris', len(U), 'bytes', os.path.getsize(f'{OUT}/{name}'))
    return ['#%02x%02x%02x' % tuple(c) for c in pal]

land = dump([t for t in ALL if t[0] != 0], 'export.bin')   # 0 — море
sea = dump([t for t in ALL if t[0] == 0], 'sea.bin')
json.dump({'x0': GX0, 'yt': GYT, 'tile': 4500, 'cols': 2, 'rows': 3, 'q': Q, 'palette': land, 'seaPalette': sea},
          open(f'{OUT}/export.json', 'w'), separators=(',', ':'))
