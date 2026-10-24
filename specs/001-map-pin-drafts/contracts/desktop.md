# Contract: програма — F9, зіставлення, оверлей

## Модуль `desktop/src/mapmatch.cjs` (чиста логіка, `node --test`)

```text
locate(frame, ref) → Result
  frame: { width, height, rgba: Buffer }        — повний знімок екрана
  ref:   { tris, palette, q } з export.bin/json  — еталон мапи

Result =
  | { kind: 'no_map' }                           — шкали не знайдено (велика карта не відкрита)
  | { kind: 'no_player' }                        — іконки гравця 0 або ≥ 2
  | { kind: 'zoom_in' | 'zoom_out', scale }      — шкала поза 100–1000 м
  | { kind: 'unsure', match }                    — іконка є, точку не визначено (R5)
  | { kind: 'point', x, y, match }               — метри гри
match = { scale_m_per_px, score, ratio }
```

Підфункції, кожна з власними тестами на знімках з `desktop/src/fixtures/map/`:
`scaleBar(frame) → { px, meters } | null`, `playerIcon(frame) → {x,y} | null`, `edges(gray, mask)`,
`renderRef(ref, m_per_px, bbox) → gray`, `ncc…`, `toWorld(...)`.

Числа зі шкали читає наявний цифровий воркер (`vision.cjs`) — у `locate` передається вже прочитане число (тест без tesseract).

## Модуль `desktop/src/outbox.cjs` (`node --test`)

```text
outbox(dir, send) → { put(draft, jpeg) → id, flush() → { sent, denied, left }, size() }
send(draft, jpeg) → 'ok' | 'denied' | 'retry'
```

## Головний процес (`main.cjs`)

| Подія | Поведінка |
|-------|-----------|
| вхід / раз на 10 хв | читає `profiles.role`; staff → реєструє `pinKey`, інакше знімає |
| `pinKey` (F9) | ігнор, якщо минуло < 5 с; знімок → `locate` у worker → `outbox.put` (крім `no_map`, `no_player`, `zoom_*`) → `flush` → оверлей |
| кожні 30 с | `outbox.flush()` |
| `bar-prefs { pinKey }` | перевірка: не збігається з `hotkey` плашки й `Alt+S`, `globalShortcut.register` вдалося; інакше помилка й стара клавіша |

## Оверлей (плашка, `showInactive`, 3 с)

| Result | Текст |
|--------|-------|
| `point`, відправлено | «Точку збережено» |
| `point`, без мережі | «Точку збережено — відправлю, щойно буде інтернет» |
| `unsure` | «Точку не визначено — чернетку збережено» |
| `no_map`, `no_player` | «Відкрийте велику карту — іконку гравця не знайдено» |
| `zoom_in` / `zoom_out` | «Наблизьте карту» / «Віддаліть карту» |
| `denied` | «Немає прав на чернетки» |
