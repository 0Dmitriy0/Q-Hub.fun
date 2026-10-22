# База «Карти для гри» (public/map/game/base.zip)

З експорту OpenHydra (папки `minimap_C_R`, файли OpenFormats) робимо нашу мінікарту:
назви місць перемальовуються шрифтом сайту (Unbounded), зелені зони — напівпрозорим відтінком
з пунктирною межею, значки Hydra прибираються (гравець вибирає наші значки на сайті).

Порядок (у папці з розпакованими експортами: `old/` — чистий, `new/` — з додатками Hydra):
1. `comps.py` — розбиває додатки `tile_2_2` на зв'язні шматки;
2. `classify.py` — назви / зони / межі зон / решта; `restyle.py` — нові зони;
3. `names2.py` — тексти й рядки назв (тексти перевірено вручну, див. `labels.json`); `glyphs.py` — назви трикутниками;
4. `build_base.py` — пише `tile_2_2…` і `.odd` у копію `old/` і пакує `base.zip`.

Потрібні: numpy, scipy, shapely, mapbox-earcut, fontTools, Pillow; шрифт `unbounded.ttf` (Google Fonts, 800).
