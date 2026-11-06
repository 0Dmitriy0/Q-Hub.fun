# «Карта для гри»: база й шари (public/map/game/*.zip)

З експорту OpenHydra (папки `minimap_C_R`, файли OpenFormats) робимо нашу мінікарту:
base.zip — чиста мапа; names.zip — назви місць шрифтом сайту (Unbounded) + малі підписи з експорту;
zones.zip — зелені зони напівпрозорим відтінком з пунктиром. Значки Hydra прибираються — гравець
галочками вибирає наші значки, назви й зони, і сайт збирає з цього архів (src/lib/gameMap.ts).
Для мапи сайту ті самі назви й зони лежать у src/data/mapLabels.json і mapZones.json.

Порядок (у папці з розпакованими експортами: `old/` — чистий, `new/` — з додатками Hydra):
1. `comps.py` — розбиває додатки `tile_2_2` на зв'язні шматки;
2. `classify.py` — назви / зони / межі зон / решта; `restyle.py` — нові зони;
3. `names2.py` — тексти й рядки назв (тексти перевірено вручну, див. `labels.json`); `glyphs.py` — назви трикутниками;
4. `build_packs.py` — пише шари (назви — `tile_3_N`, зони — `tile_4_N`) і пакує zip; `.odd` збирає вже сайт.

Потрібні: numpy, scipy, shapely, mapbox-earcut, fontTools, Pillow; шрифт `unbounded.ttf` (Google Fonts, 800).

**Зараз (22.10):** назви — текст Hydra як є: `hydra_names.py` (у папці з `new/` = OpenHydra_Custom_2 і `base/` =
OpenHydra_Custom_4) пише `names.zip`, `names.bin`, `namesPalette` в `export.json` і виправляє висоту нових локацій у `base.zip`.
Після `scripts/map-export.py` запускати `hydra_names.py` не обов'язково — `namesPalette` зберігається.
