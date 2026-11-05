---
name: gta-enhanced-map-ytd
description: Мапа для гри на GTA V Enhanced — OpenIV не відкриває YTD, але YTD звичайної версії, вставлені цілим файлом, працюють
metadata:
  type: project
---

Перевірено 2026-11-04 з гравцем на GTA V Enhanced (RAGE MP, `gta5_enhanced.exe`):
- `minimap.rpf` з архіву Q-Hub (OpenFormats `.odr/.odd`, імпорт через OpenIV) на Enhanced працює — мінікарта й зум.
- Відкрити й замінити текстуру всередині `minimap_….ytd` у `scaleform_generic.rpf` на Enhanced OpenIV **не може** (формат gen9). Без цього на найдальшому зумі видно стандартну мапу.
- Рішення, що спрацювало: власник на Legacy замінив PNG в OpenIV, експортував готові 13 `.ytd`, гравець на Enhanced перетягнув їх в OpenIV цілими файлами поверх старих — усе працює.

**Why:** YTD у форматі Legacy (RSC7) Enhanced приймає; ламається лише редагування YTD в OpenIV.

**How to apply:** з 2026-11-05 сайт сам генерує готові `.ytd` (`src/lib/ytd.ts`, тест — `ytd.test.ts` зі значеннями з файлів OpenIV). Якщо гра відкине файл — спершу звірити розпакований заголовок (перші 0x118 байт) з `.ytd`, збереженим OpenIV на Legacy: у зразках відрізнялись лише ім'я, хеш, розміри, stride, формат і поле розміру даних (0x80).
