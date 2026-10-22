# Тайли назв для мапи сайту (z3–z6): той самий текст Hydra, що й у грі (public/map/game/names.bin),
# готовими прозорими картинками — браузер не перемальовує 200 тис. трикутників на кожному зумі.
# На z7+ сайт малює ці трикутники сам (на тайл припадає кілька літер). Порожні тайли не зберігаються;
# список наявних — public/map/n/index.json. Запуск: python3 scripts/map-names-tiles.py public/map
import numpy as np, json, os, sys
from PIL import Image, ImageDraw
OUT = sys.argv[1] + '/n'; G = sys.argv[1] + '/game'
X0, YT, PXM, ZMAX, TS, SS, ZMIN = -5996.0, 8470.0, 1.28, 6, 256, 3, 3
meta = json.load(open(G + '/export.json')); pal = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in meta['namesPalette']]
buf = open(G + '/names.bin', 'rb').read(); n = int(np.frombuffer(buf[:4], '<u4')[0])
U = np.frombuffer(buf[4:4 + n * 12], '<u2').reshape(n, 3, 2).astype(float); C = np.frombuffer(buf[4 + n * 12:4 + n * 13], 'u1')
P = np.empty_like(U); P[..., 0] = (U[..., 0] / meta['q'] + meta['x0'] - X0) * PXM; P[..., 1] = (YT - (meta['yt'] - U[..., 1] / meta['q'])) * PXM
mn, mx = P.min(1), P.max(1); N = 2 ** ZMAX
buckets = {}
for i in range(n):
    for tx in range(int(mn[i, 0] // TS), int(mx[i, 0] // TS) + 1):
        for ty in range(int(mn[i, 1] // TS), int(mx[i, 1] // TS) + 1):
            buckets.setdefault((tx, ty), []).append(i)
level = {}
for (tx, ty), ids in buckets.items():
    im = Image.new('RGBA', (TS * SS, TS * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i in ids: d.polygon([((x - tx * TS) * SS, (y - ty * TS) * SS) for x, y in P[i]], fill=pal[C[i]] + (255,))
    level[(tx, ty)] = im.resize((TS, TS), Image.LANCZOS)
have = {}
def save(z, x, y, im):
    if im.getextrema()[3][1] == 0: return
    os.makedirs(f'{OUT}/{z}/{x}', exist_ok=True); im.save(f'{OUT}/{z}/{x}/{y}.webp', 'WEBP', quality=90, method=6); have.setdefault(z, []).append(x * N + y)
for (x, y), im in level.items(): save(ZMAX, x, y, im)
for z in range(ZMAX - 1, ZMIN - 1, -1):
    nxt = {}
    for (x, y) in {(a // 2, b // 2) for a, b in level}:
        big = Image.new('RGBA', (TS * 2, TS * 2), (0, 0, 0, 0))
        for dx in (0, 1):
            for dy in (0, 1):
                c = level.get((2 * x + dx, 2 * y + dy))
                if c: big.paste(c, (dx * TS, dy * TS))
        nxt[(x, y)] = big.resize((TS, TS), Image.LANCZOS); save(z, x, y, nxt[(x, y)])
    level = nxt
json.dump({'n': N, 'have': {z: sorted(v) for z, v in have.items()}}, open(f'{OUT}/index.json', 'w'), separators=(',', ':'))
print({z: len(v) for z, v in have.items()})
