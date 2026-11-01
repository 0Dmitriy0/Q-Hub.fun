"""Кільцева траса для мапи сайту (шар «Кільцева траса», src/data/ringRoad.json).

У даних мапи (public/map/game/export.bin) усі дороги одного кольору — траси від вулиць не відрізнити.
Тому шлях прокладається найкоротшим маршрутом дорогами між опорними точками вздовж кільця:
західне узбережжя (Great Ocean Hwy) → Палето → Сенора → берегове шосе → швидкісна Лос-Сантоса → назад.

  python3 scripts/ring-road.py          # перебудувати src/data/ringRoad.json
  python3 scripts/ring-road.py --png x  # плюс картинка для перевірки

Потрібні numpy, scipy, scikit-image, Pillow. Перебудовувати після зміни export.bin."""
import json, struct, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.graph import route_through_array
from skimage.measure import approximate_polygon

M = 4.0                       # метрів на піксель растра
X0, YT = -4140, 8400          # лівий верхній кут текстур гри
# опорні точки (метри гри), за годинниковою стрілкою від Пасифік-Блафс; останню = першій (кільце)
WP = [(-2100, -360), (-2900, 60), (-3020, 600), (-3140, 960), (-3020, 1520), (-3000, 2000), (-2740, 2260), (-2650, 2700),
      (-2600, 3000), (-2560, 3300), (-2480, 3600), (-2360, 4120), (-2100, 4500), (-1800, 4800), (-1500, 4960), (-940, 5400),
      (-380, 6160), (180, 6560), (980, 6500), (1940, 6280), (2120, 6150), (2280, 6000), (2420, 5840), (2660, 5040),
      (2900, 4240), (2900, 3960), (2770, 3400), (2450, 2980), (2090, 2680), (1910, 2000), (2110, 1400), (2410, 960),
      (2570, 480), (2570, 80), (2450, -280), (2290, -480), (1600, -900), (1050, -1150), (1000, -1000), (950, -800),
      (850, -620), (650, -520), (300, -475), (-300, -475), (-550, -495), (-800, -490), (-1300, -560), (-2100, -360)]


def roads():
    buf = open('public/map/game/export.bin', 'rb').read()
    n = struct.unpack('<I', buf[:4])[0]
    xy = np.frombuffer(buf, np.uint16, n * 6, 4).reshape(n, 3, 2).astype(float) / 4
    col = np.frombuffer(buf, np.uint8, n, 4 + n * 12)
    im = Image.new('L', (int(9000 / M), int(13500 / M)), 0); d = ImageDraw.Draw(im)
    for t in xy[col == col.max()]:   # дороги — останній (найяскравіший) колір палітри
        d.polygon([(p[0] / M, p[1] / M) for p in t], fill=255)
    return np.array(im) > 127


def main():
    road0 = roads()
    road = ndimage.binary_closing(road0, iterations=4)   # дрібні розриви між шматками доріг
    dt = ndimage.distance_transform_edt(road)
    blob = ndimage.binary_dilation(ndimage.distance_transform_edt(road0) > 10, iterations=2)   # суцільні плями (база, аеропорт) — не дороги
    ok = road & ~blob
    cost = np.where(ok, np.where(road0, 1.0, 3.0) / (0.5 + np.minimum(dt, 2)), 1e4)
    # у Лос-Сантосі навпаки: швидкісна намальована тонкими смугами (тонша за вулиці) — тонкі дешевші, широкі вулиці дорогі
    r0, r1 = int((YT - 0) / M), int((YT + 1300) / M); c0, c1 = int((-2400 - X0) / M), int((2400 - X0) / M)
    d0 = ndimage.distance_transform_edt(road0)[r0:r1, c0:c1]
    cost[r0:r1, c0:c1] = np.where(road0[r0:r1, c0:c1], np.where(d0 <= 2.2, 1.0, 6.0), 1e4)

    def px(g):
        r, c = int(round((YT - g[1]) / M)), int(round((g[0] - X0) / M))
        ys, xs = np.nonzero(ok[r - 30:r + 31, c - 30:c + 31])
        k = np.argmin((ys - 30) ** 2 + (xs - 30) ** 2); return (r - 30 + ys[k], c - 30 + xs[k])

    pts = [px(g) for g in WP]; path = []
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        p, _ = route_through_array(cost, a, b, fully_connected=True, geometric=True)
        straight = np.hypot(a[0] - b[0], a[1] - b[1])
        if len(p) > 2.2 * straight + 40:   # дорогу в даних розірвано — коротка пряма замість об'їзду через пів мапи
            print('пряма між', WP[i], WP[i + 1]); n = int(straight) + 1
            p = [(round(a[0] + (b[0] - a[0]) * t / n), round(a[1] + (b[1] - a[1]) * t / n)) for t in range(n + 1)]
        path += p if not path else p[1:]
    p = np.array(path, float)
    k = 9; pad = np.vstack([p[-k:], p, p[:k]])   # згладити сходинки растра
    sm = np.vstack([np.convolve(pad[:, i], np.ones(k) / k, mode='same')[k:-k] for i in range(2)]).T
    g = [[round(c * M + X0, 1), round(YT - r * M, 1)] for r, c in approximate_polygon(sm, tolerance=0.8)]
    json.dump(g, open('src/data/ringRoad.json', 'w'), separators=(',', ':'))
    km = sum(np.hypot(x1 - x0, y1 - y0) for (x0, y0), (x1, y1) in zip(g, g[1:])) / 1000
    print(f'ringRoad.json: {len(g)} точок, ~{km:.1f} км')
    if '--png' in sys.argv:
        im = Image.fromarray((road0 * 120).astype(np.uint8)).convert('RGB'); d = ImageDraw.Draw(im)
        d.line([(c, r) for r, c in sm], fill=(255, 210, 74), width=5)
        im.save(sys.argv[sys.argv.index('--png') + 1])


if __name__ == '__main__':
    main()
