# Implementation Plan: Фірмовий інсталятор Q-Hub

**Branch**: `008-branded-installer` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

## Summary

Рішення власника (2026-10-31): лишаємося на NSIS (electron-builder), без чужих плагінів-скінів. Темні екрани, логотип,
українська мова, «Параметри» в одному вікні, «Оновити з X до Y», перевірка теки до копіювання, деінсталятор з «видалити
мої дані». **Кнопки й смуга прогресу — системні Windows** (помаранчевих кнопок FR-001 у NSIS без чужої DLL не буває) —
свідоме відхилення від FR-001/FR-010 (відсоток), див. Complexity Tracking.

## Technical Context

**Tooling**: electron-builder 25.1.8 (NSIS 3.0.4, MUI2, nsDialogs), Electron 37
**Files**: `desktop/build/installer.nsh` (UTF-8 з BOM), `desktop/package.json` → `build.nsis`, картинки `desktop/build/installer-*.bmp`,
`icon.ico` — малює `desktop/scripts/installer-art.cjs` (Electron → BMP/ICO)
**Testing**: `node --test` (`autostart.test.cjs`); ручна перевірка пробною збіркою «Q-Hub Test» (окремі appId, назва, тека)

## Хуки electron-builder

| Хук | Що робить |
|---|---|
| `customInstallMode` | лише поточний користувач — сторінки «Для кого» немає (FR-013) |
| `customWelcomePage` | «Старт»: логотип, версія, стан (новий / оновлення / перевстановлення / старіша), «Параметри» (тека, ярлик, автозапуск), перевірка прав і місця (FR-007–009, 014) |
| `customPageAfterChangeDir` | повертає теку зі «Старту» (electron-builder між ними ставить типову); темний прогрес; при `--updated` — без «Готово», запуск програми при `--force-run` |
| `customInstall` | ярлик за вибором; `installer.json` з вибором автозапуску для програми |
| `customUnWelcomePage` / `customUnInstall` | прапорець «видалити мої локальні дані»; запис автозапуску — за назвою програми |

Програма: `autostartOnStart({ chosen })` — вибір інсталятора важливіший за типові правила; `LOGIN.name = app.getName()`.

## Constitution Check

I–IV не зачіпаються. V: локальні дані при оновленні й типовому видаленні лишаються. VI: тест `autostartOnStart`.

## Complexity Tracking

| Відхилення | Чому |
|---|---|
| FR-001: кнопки й прогрес системні | рішення власника 2026-10-31 — без стороннього плагіна-скіна |
| FR-010: без відсотка | стандартна смуга NSIS; підпис кроку — є |
