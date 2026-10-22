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
names = {}; allT = []
for f in sorted(glob.glob('new/*/supertile_fore_*_tile_2_2/*.mesh')):
    k = re.search(r'minimap_(\d+_\d+)', f).group(1)
    T = tris_of(f); T = T[T[:, :, 2].mean(1) >= 20]
    if not len(T): continue
    T = T[np.argsort(T[:, :, 2].mean(1), kind='stable')]   # спершу тінь, потім літери
    allT.append(T)
    for part, s in enumerate(range(0, len(T), 20000)):
        tile = f'supertile_fore_{k}_tile_3_{part}'
        mesh, odr = mesh_odr(tile, T[s:s + 20000])
        names[f'minimap_{k}/{tile}/{tile}_high.mesh'] = mesh; names[f'minimap_{k}/{tile}.odr'] = odr
write_zip(P + 'names.zip', names)
T = np.concatenate(allT); T = T[np.argsort(T[:, :, 2].mean(1), kind='stable')]   # увесь текст за висотою: тінь під літерами й на межах частин
print('names tris', len(T), 'folders', len({p.split('/')[0] for p in names}), 'bytes', os.path.getsize(P + 'names.zip'))

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
src = zipfile.ZipFile(P + 'base.zip'); out = {}
for f in sorted(glob.glob('base/*/supertile_fore_*_tile_2_2/*.mesh')):
    k = re.search(r'minimap_(\d+_\d+)', f).group(1); T = tris_of(f)
    T = T[~((T[:, 0, 3] == 255) & (T[:, 0, 4] == 0) & (T[:, 0, 5] == 0))]
    hi = T[:, :, 2] >= 20; T[:, :, 2] = np.where(hi, T[:, :, 2] - 16, T[:, :, 2])
    T = T[np.argsort(T[:, :, 2].mean(1), kind='stable')]
    tile = f'supertile_fore_{k}_tile_2_2'; mesh, odr = mesh_odr(tile, T)
    out[f'minimap_{k}/{tile}/{tile}_high.mesh'] = mesh; out[f'minimap_{k}/{tile}.odr'] = odr
    print('base', k, 'tris', len(T), 'z', round(T[:, :, 2].min(), 1), round(T[:, :, 2].max(), 1))
tmp = P + 'base.new.zip'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for info in src.infolist():
        if info.filename in out: z.writestr(info.filename, out[info.filename].encode())
        else: z.writestr(info, src.read(info.filename))
src.close(); os.replace(tmp, P + 'base.zip'); print('base.zip', os.path.getsize(P + 'base.zip'))
