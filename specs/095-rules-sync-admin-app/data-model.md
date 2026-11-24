# Data Model: 095

## rules_sync_runs (нова, міграція 0081)

| Поле | Тип | Опис |
|---|---|---|
| id | bigint identity PK | |
| at | timestamptz not null default now() | час спроби |
| via | text not null check (via in ('server','app')) | звідки: щоденний/ручний запуск функції чи програма адміна |
| by | uuid null → auth.users | хто: адмін для `app` і ручного запуску, null для GitHub (секрет) |
| ok | boolean not null | хоч одне джерело оновилось і знімок записано |
| topics | int null | тем у знімку після спроби |
| items | int null | пунктів у знімку після спроби |
| changes | int null | записів у журналі змін |
| error | text null | коротка причина, якщо `ok = false` (напр. «форум не пускає сервер (403)», «підозріло мало пунктів…») |

- RLS: `select` лише `my_role() = 'admin'`. `insert/update/delete` немає жодній ролі (пише функція через service role).
- Індекс: `(ok, at desc)`: остання вдала спроба.
- Зберігання: рядки старші за 90 днів видаляє сама функція після кожного запису (`delete … where at < now() - interval '90 days'`).

## Тіло запиту від програми (див. contracts/rules-sync-app.md)

```text
{ via: 'app', version: string, fresh: SnapTopic[], errors: [srcId, message][], titles: [srcId, title][] }
```

Правила перевірки (`guard.ts`):
- `fresh` — масив ≤ 300 тем; кожна має `title` (≤ 300), `section` (≤ 300), `url` на `forum.quant5.com.ua` (≤ 500), `kind ∈ rules|law|order|info`, `src` — id наявного ввімкненого джерела, `items` ≤ 2000 з `n` (≤ 40), `h` (≤ 300), `s` (≤ 20000).
- `errors`/`titles` — лише id наявних джерел. Рядки ≤ 500.
- Загальний розмір тіла ≤ 4 МБ.
- Порушення дає `400` з поясненням, знімок не змінюється, і пишеться `rules_sync_runs(ok=false)`.

## Запобіжник (обидва шляхи)

Для кожного джерела без помилки: `0` тем або `items < 0.5 × items_попередні` (якщо попередніх > 0) → помилка джерела «підозріло мало пунктів (N замість M) — знімок не змінено». Далі `merge()` лишає попередні теми цього джерела, як для будь-якої помилки.

## Локальний стан програми: `%APPDATA%\Q-Hub\rulesync.json`

```text
{ lastAttempt: ISO, lastResult: 'ok' | 'forum' | 'server' | 'net', note?: string }
```

Пора, якщо: `myRole === 'admin'` і `now − lastAttempt ≥ 24 год` і (за базою) немає `rules_sync_runs.ok` за 24 год.
