# Контракт програми: вікно входу, шапка, ціни

## IPC (`desktop/src/preload.cjs` → `desktop/src/main.cjs`)

| Виклик | Було | Стане |
|---|---|---|
| `state()` | `{ user: { name, avatar, gameName, staticId }, characters: [{ id, name }], character }` | `{ user: { name, avatar, nick, nickChangedAt }, characters: [{ id, name, static }], character }` |
| `nickSet(nick)` | — | новий; лише з вікна входу й налаштувань; повертає `state()` або `{ …state, error }` |
| `charAdd({ name, static, start })` | пише нік і статік у **профіль** | пише `static_id` у **персонажа**; профіль не чіпає |
| `bar-data` | `user.gameName`, `user.staticId` | `user.nick`, поточний персонаж зі `static` |

Перевірка вводу — чиста логіка з тестами `node --test`:

- `desktop/src/character.cjs` — `parseCharacter` (є), без змін формату;
- `desktop/src/nick.cjs` — `parseNick(s)`: trim, `^[A-Za-z0-9_]{3,20}$`, текст відмови українською.

## Вікно входу (`desktop/src/index.html`, `renderer.js`)

```text
не ввійшов            → «Увійти через Discord»
ввійшов, нік null     → форма «Нік у Q-Hub» (3–20, латиниця, цифри, _) → nickSet
нік є, персонажів 0   → форма персонажа (відкрита)
нік є, персонажі є    → плитки: Ім'я_Прізвище + #статік, «+ Новий» (сховано, коли їх 3)
```

## Шапка плашки (`src/desktop/Bar.tsx`)

```text
[аватар]  D_VYRX                 ← нік акаунта
          Dmitriy_Core #171028   ← вибраний персонаж; меню — інші персонажі
```

## «Зір» (`autoPrices`, `autoNextChange`, `autoUnknown`)

- до кожного запису — `character_id: settings.character` **у момент зчитування** (черга без мережі зберігає його разом із ціною);
- відмова «Спершу вибери нік» — програма показує вікно входу з формою ніка.
