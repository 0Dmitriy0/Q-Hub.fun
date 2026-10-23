# Назви з експорту Hydra як є (без перемальовування) + виправлення бази.
# Запуск у папці, де new/ — розпакований експорт Hydra з назвами (OpenHydra_Custom_2.zip),
# base/ — розпакований public/map/game/base.zip; поруч comps.pkl-генератор не потрібен — компоненти рахуються тут.
#  - names.zip: лише текст Hydra (висота z >= 20: літери й тінь), без значків Hydra (z 17-18) і зон
#  - base.zip: у tile_2_2 нових локацій (військова база z 29-30) висота знижується до рівня Деморгану (13-14),
#    щоб назви (20+) і наші значки (17-17.6) лежали над нею; червоний трикутник-залишок Hydra прибирається
#  - names.bin: ті самі трикутники назв для текстур гри й мапи сайту (формат як export.bin, порядок — за висотою)
import re, glob, os, sys, math, zipfile, shutil, numpy as np, json
sys.path.insert(0, os.path.dirname(__file__))
P = sys.argv[1] if len(sys.argv) > 1 else '/home/user/q-hub.fun/public/map/game/'

def tris_of(path):
    out = []
    s = open(path).read()
    for g in re.finditer(r'Indices (\d+)\s*\{(.*?)\}\s*Vertices (\d+)\s*\{(.*?)\}', s, re.S):
        idx = np.array(g.group(2).split(), dtype=int).reshape(-1, 3); V = []
        for line in g.group(4).strip().split('\n'):
            p, c = line.split('/')[:2]; p = p.split(); c = c.split()
            V.append((float(p[0]), float(p[1]), float(p[2]), int(c[0]), int(c[1]), int(c[2])))
        out.append(np.array(V)[idx])
    return np.concatenate(out) if out else np.zeros((0, 3, 6))

f7 = lambda v: f'{v:.7f}'
def mesh_odr(tile, tris):
    verts = {}; V = []; I = []
    for t in tris:
        for p in t:
            key = (round(p[0], 3), round(p[1], 3), round(p[2], 3), int(p[3]), int(p[4]), int(p[5]))
            if key not in verts: verts[key] = len(V); V.append(key)
            I.append(verts[key])
    V = np.array(V, float); mn = V[:, :3].min(0); mx = V[:, :3].max(0)
    lines = '\n'.join('\t\t\t\t' + ' '.join(map(str, I[i:i + 15])) for i in range(0, len(I), 15))
    vl = '\n'.join(f'\t\t\t\t{f7(v[0])} {f7(v[1])} {f7(v[2])} / {int(v[3])} {int(v[4])} {int(v[5])} 255' for v in V)
    mesh = (f'Version 165 32\n{{\n\tLocked false\n\tSkinned false\n\tBoneCount 0\n\tMask 255\n\tBounds\n\t{{\n\t\tAabb\n\t\t{{\n\t\t\tMin {" ".join(map(f7, mn))}\n\t\t\tMax {" ".join(map(f7, mx))}\n\t\t}}\n\t}}\n'
            f'\tGeometries\n\t{{\n\t\tGeometry\n\t\t{{\n\t\t\tShaderIndex 0\n\t\t\tFlags -\n\t\t\tVertexDeclaration NB60E6ACF\n\t\t\tIndices {len(I)}\n\t\t\t{{\n{lines}\n\t\t\t}}\n'
            f'\t\t\tVertices {len(V)}\n\t\t\t{{\n{vl}\n\t\t\t}}\n\t\t}}\n\t}}\n}}')
    c = (mn + mx) / 2; r = math.sqrt(((mx - mn) / 2).dot((mx - mn) / 2))
    odr = (f'Version 165 32\n{{\n\tShaders\n\t{{\n\t\tminimap.sps\n\t\t{{\n\t\t\tUseTessellation 0.0000000\n\t\t}}\n\t}}\n\tSkeleton null\n\tLodGroup\n\t{{\n\t\tHigh 9998.0\n\t\t{{\n\t\t\t{tile}\\{tile}_high.mesh 0\n\t\t}}\n'
           f'\t\tMed 9998.0\n\t\tLow 9998.0\n\t\tVlow 9998.0\n\t\tAABBMin {" ".join(map(f7, mn))}\n\t\tAABBMax {" ".join(map(f7, mx))}\n\t\tRadius {r:.5f}\n\t\tCenter {" ".join(map(f7, c))}\n\t}}\n\tLight null\n\tBound null\n\tJoints null\n}}')
    return mesh, odr

def write_zip(name, files):   # files: {path: text}; папки — окремими записами, як у Hydra
    dirs = sorted({p.rsplit('/', 1)[0] + '/' for p in files} | {p.split('/')[0] + '/' for p in files})
    with zipfile.ZipFile(name, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for d in dirs: z.writestr(zipfile.ZipInfo(d), '')
        for p in sorted(files): z.writestr(p, files[p].encode())

# ---- назви ----
# з тексту прибираємо кільця-обводки зелених зон (суцільні й пунктирні): зелені шматки, що цілком лежать
# на межі зони з src/data/mapZones.json — інакше кільця ставились навіть без шару «Зелені зони»
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
from shapely.prepared import prep
ZJ = json.load(open(os.path.join(os.path.dirname(__file__), '../../src/data/mapZones.json')))
EDGE = prep(unary_union([Polygon(p[0], p[1:]) for p in ZJ]).boundary.buffer(9))
def comps(T):   # зв'язні шматки за спільними вершинами
    key = {}; par = []
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    ids = np.empty((len(T), 3), int)
    for i, t in enumerate(T):
        for j, p in enumerate(t):
            k = (round(p[0], 3), round(p[1], 3), round(p[2], 3))
            if k not in key: key[k] = len(par); par.append(len(par))
            ids[i, j] = key[k]
    for a, b, c in ids:
        ra = find(a); par[find(b)] = ra; par[find(c)] = ra
    root = np.array([find(a) for a in ids[:, 0]])
    return [np.where(root == r)[0] for r in np.unique(root)]

# ---- логотип Q-Hub під «ГОРА "ЧІЛІАД"» (public/brand/q-hub-logo.svg): скруглений квадрат і «Q», з тінню як у тексту Hydra ----
import mapbox_earcut as earcut
from shapely.geometry import box
LOGO_X, LOGO_Y, LOGO_M = 675.0, 5478.0, 64.0   # центр і розмір, м; назва «"ЧІЛІАД"» — y 5537, висота 35 м
def svg_q():
    d = re.search(r' d="([^"]+)"', open(os.path.join(os.path.dirname(__file__), '../../public/brand/q-hub-logo.svg')).read()).group(1)
    tok = re.findall(r'[MHLQZ]|-?[\d.]+', d); rings = []; cur = []; i = 0; x = y = 0.0
    while i < len(tok):
        c = tok[i]; i += 1
        if c == 'M': x, y = float(tok[i]), float(tok[i + 1]); i += 2; cur = [(x, y)]
        elif c == 'H': x = float(tok[i]); i += 1; cur.append((x, y))
        elif c == 'L': x, y = float(tok[i]), float(tok[i + 1]); i += 2; cur.append((x, y))
        elif c == 'Q':
            cx, cy, ex, ey = map(float, tok[i:i + 4]); i += 4
            for t in np.linspace(0, 1, 7)[1:]: cur.append(((1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t * t * ey))
            x, y = ex, ey
        elif c == 'Z': rings.append(cur); cur = []
    # у SVG: translate(130.69 346.752) scale(0.256 -0.256) у квадраті 512
    return [[(130.69 + 0.256 * a, 346.752 - 0.256 * b) for a, b in r] for r in rings]
def tri(poly):   # shapely-полігон (з дірками) -> трикутники (N,3,2)
    out = []
    for g in getattr(poly, 'geoms', [poly]):
        rings = [np.array(g.exterior.coords[:-1])] + [np.array(h.coords[:-1]) for h in g.interiors]
        v = np.concatenate(rings); ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
        out.append(v[np.array(earcut.triangulate_float64(v, ends)).reshape(-1, 3)])
    return np.concatenate(out)
def logo_tris(z):
    k = LOGO_M / 512
    to = lambda P: np.stack([LOGO_X + (P[..., 0] - 256) * k, LOGO_Y - (P[..., 1] - 256) * k], -1)
    sq = box(0, 0, 512, 512).buffer(-146).buffer(146, resolution=8)
    rings = svg_q(); outer = Polygon(rings[1], [rings[2]]); tail = Polygon(rings[0])
    q = outer.union(tail)
    def pack(P, col, zz, dx=0.0, dy=0.0):
        T = to(P); T[..., 0] += dx; T[..., 1] += dy
        return np.concatenate([T, np.full(T.shape[:2] + (1,), zz), np.broadcast_to(np.array(col, float), T.shape[:2] + (3,))], -1)
    sh = LOGO_M * 0.06
    return np.concatenate([pack(tri(sq), (13, 13, 13), z, sh, -sh), pack(tri(sq), (255, 106, 31), z + 0.05), pack(tri(q), (20, 7, 0), z + 0.1)])
LOGO = logo_tris(36.0)
LOGO_K = f'{int((LOGO_X + 4500) // 1175)}_{int((8000 - LOGO_Y) // 1388)}'
greenish = lambda c: c[1] > c[0] + 25 and c[1] > c[2] and c[1] > 60
area = lambda T: 0.5 * np.abs((T[:, 1, 0] - T[:, 0, 0]) * (T[:, 2, 1] - T[:, 0, 1]) - (T[:, 2, 0] - T[:, 0, 0]) * (T[:, 1, 1] - T[:, 0, 1])).sum()
names = {}; allT = []; rings = 0
for f in sorted(glob.glob('new/*/supertile_fore_*_tile_2_2/*.mesh')):
    k = re.search(r'minimap_(\d+_\d+)', f).group(1)
    T = tris_of(f); T = T[T[:, :, 2].mean(1) >= 20]
    if not len(T): continue
    keep = np.ones(len(T), bool)
    for ix in comps(T):
        Tc = T[ix]; w = np.ptp(Tc[:, :, 0]); h = np.ptp(Tc[:, :, 1])
        hollow = area(Tc) / max(1.0, w * h) < 0.2 and max(w, h) > 8   # тонке кільце чи дуга, а не літера
        hollow = hollow or (tuple(T[ix[0], 0, 3:6]) == (0, 255, 145) and max(w, h) < 3)   # рисочка пунктирного кола (менша за будь-яку літеру)
        if greenish(T[ix[0], 0, 3:6]) and (hollow or all(EDGE.contains(Point(p[0], p[1])) for p in Tc[:, :, :2].reshape(-1, 2))):
            keep[ix] = False; rings += 1
    T = T[keep]
    if k == LOGO_K: T = np.concatenate([T, LOGO])
    if not len(T): continue
    T = T[np.argsort(T[:, :, 2].mean(1), kind='stable')]   # спершу тінь, потім літери
    allT.append(T)
    for part, s0 in enumerate(range(0, len(T), 60000)):
        tile = f'supertile_fore_{k}_tile_3_{part}'
        mesh, odr = mesh_odr(tile, T[s0:s0 + 60000])
        names[f'minimap_{k}/{tile}/{tile}_high.mesh'] = mesh; names[f'minimap_{k}/{tile}.odr'] = odr
write_zip(P + 'names.zip', names)
T = np.concatenate(allT); T = T[np.argsort(T[:, :, 2].mean(1), kind='stable')]   # увесь текст за висотою: тінь під літерами й на межах частин
print('names tris', len(T), 'rings removed', rings, 'folders', len({p.split('/')[0] for p in names}), 'files', sum(p.endswith('.odr') for p in names), 'bytes', os.path.getsize(P + 'names.zip'))

# names.bin — у проєкції текстур гри, як export.bin
GX0, GYT, W, H, Q = -4140.0, 8400.0, 9000.0, 13500.0, 4
Pp = np.stack([T[..., 0] - GX0, GYT - T[..., 1]], -1); C = T[:, 0, 3:6].astype(int)
pal, ci = np.unique(C, axis=0, return_inverse=True)
U = np.round(np.clip(Pp, [0, 0], [W, H]) * Q).astype('<u2')
with open(P + 'names.bin', 'wb') as f:
    f.write(np.uint32(len(U)).tobytes()); f.write(U.reshape(-1).tobytes()); f.write(ci.reshape(-1).astype(np.uint8).tobytes())
meta = json.load(open(P + 'export.json')); meta['namesPalette'] = ['#%02x%02x%02x' % tuple(c) for c in pal]
json.dump(meta, open(P + 'export.json', 'w'), separators=(',', ':'))
print('names.bin', os.path.getsize(P + 'names.bin'), 'colors', len(pal))

# ---- база: висота нових локацій і червоний залишок ----
src = zipfile.ZipFile(P + 'base.zip'); out = {}; moved = set()
for f in sorted(glob.glob('base/*/supertile_fore_*_tile_2_2/*.mesh')):
    k = re.search(r'minimap_(\d+_\d+)', f).group(1); T = tris_of(f)
    T = T[~((T[:, 0, 3] == 255) & (T[:, 0, 4] == 0) & (T[:, 0, 5] == 0))]
    hi = T[:, :, 2] >= 20; T[:, :, 2] = np.where(hi, T[:, :, 2] - 16, T[:, :, 2])
    T = T[np.argsort(T[:, :, 2].mean(1), kind='stable')]
    # гра, схоже, малює частини в порядку номерів (tile_0_0, 0_1 … 2_2), а не за висотою: локація — одразу після
    # мапи (tile_0_1), щоб назви, зони й значки у старших номерах лягали поверх неї
    tile = f'supertile_fore_{k}_tile_0_1'; mesh, odr = mesh_odr(tile, T)
    out[f'minimap_{k}/{tile}/{tile}_high.mesh'] = mesh; out[f'minimap_{k}/{tile}.odr'] = odr; moved.add(k)
    print('base', k, 'tris', len(T), 'z', round(T[:, :, 2].min(), 1), round(T[:, :, 2].max(), 1))
tmp = P + 'base.new.zip'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    gone = re.compile(r'minimap_(\d+_\d+)/supertile_fore_\1_tile_2_2')
    for info in src.infolist():
        m = gone.match(info.filename)
        if m and m.group(1) in moved: continue
        if info.filename.endswith('.odd') and info.filename[8:-4] in moved:
            txt = src.read(info.filename).decode().replace('_tile_2_2.odr', '_tile_0_1.odr')
            head, body = txt.split('{', 1); lines = sorted(l for l in body.rsplit('}', 1)[0].split('\n') if l.strip())
            z.writestr(info, head + '{\n' + '\n'.join(lines) + '\n}'); continue
        z.writestr(info, src.read(info.filename))
    for k in sorted(moved):
        z.writestr(zipfile.ZipInfo(f'minimap_{k}/supertile_fore_{k}_tile_0_1/'), '')
    for name, text in out.items(): z.writestr(name, text.encode())
src.close(); os.replace(tmp, P + 'base.zip'); print('base.zip', os.path.getsize(P + 'base.zip'))
