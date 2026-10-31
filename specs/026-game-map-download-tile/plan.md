# Implementation Plan: Вікно «Мапа для гри» — красиве, зручне, з міні-переглядом

**Branch**: `026-game-map-download-tile` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

## Summary

Перегляд будується не з текстур архіву (важкий `drawMap`: ~4,5 МБ і полотно на кожну зміну), а з того, що вже є
на мапі сайту: плитки, вектор і назви Leaflet у **темі мапи для гри**, зелені зони й поля — полігонами, мітки — одним
полотном поверх, кружок кольору категорії з іконкою діаметром `iconM` метрів (як `drawPins`). Наближення й рух —
Leaflet. Вікно — дві колонки (перегляд | вибір із прокруткою + «Скачати» з підсумком), на телефоні перегляд зверху,
кнопка прилипає донизу. Групи згортаються, мають свої «усі / жодної»; попередження — плашками біля того, чого
стосуються. Плитка на головній — мініатюра (плитка z0, обрізана до ділянки гри) з перемикачем теми й трьома кроками.
Збирання архіву (`buildGamePack`) не змінюється (FR-010).

## Technical Context

**Language/Version**: TypeScript 5, React + Vite, Leaflet 1.9
**Primary Dependencies**: без нових
**Storage**: без змін; тема мапи для гри — `localStorage` (як specs/021), тепер у `gameTheme.ts`
**Testing**: `vitest` (`gamePreview.test.ts`); знімки вікна й головної через Electron з `desktop/`
**Constraints**: шари мапи сайту за замовчуванням і далі йдуть за темою сайту — новий параметр `theme` необов'язковий

## Constitution Check

| Принцип | Як дотримано |
|---|---|
| I–III | не зачіпаються |
| IV | дані ті самі, що в архіві; перегляд нічого не вигадує |
| V | програму не зачіпає (у плашці «Мапи для гри» немає, specs/014) |
| VI | `gamePreview.test.ts`: межі збігаються з `GAME`, радіус значка в метрах, підсумок кнопки |

Порушень немає.

## Project Structure

```text
src/components/GamePreview.tsx      — перегляд (Leaflet + полотно міток)
src/components/GameMapExport.tsx    — нове вікно; go() без змін
src/lib/gamePreview.ts (+ test)     — межі, радіус значка, підсумок кнопки, пороги попереджень
src/lib/mapMarks.ts, mapVector.ts   — необов'язковий theme у baseMap / vectorLayer / namesLayer
src/lib/gameTheme.ts                — readGameTheme / saveGameTheme
src/lib/gameMap.ts                  — прибрано previewMap (замінено переглядом)
src/pages/MapPage.tsx               — mdlg wide, loading до приходу міток
src/pages/Home.tsx, src/styles.css  — GameMapTile, стилі .gx-*, .gprev-*, .h-dl-*
```

## Complexity Tracking

Немає.
