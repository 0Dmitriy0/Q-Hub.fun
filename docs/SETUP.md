# Q-Hub: налаштування й розробка

Для власника й розробників: як підняти базу, вхід через Discord і автодеплой. Що таке Q-Hub — у [README](../README.md).

## Як влаштовано

- Статичний сайт (Vite + React + TypeScript). Збирається в папку `dist/`, яка працює на будь-якому хостингу, зокрема Hostiq.
- Дані, вхід через Discord і правила доступу — у **Supabase**. Особисте захищене на рівні бази (Row Level Security):
  навіть з публічним ключем чужий облік не прочитати. Перевіряє `supabase/tests/rls_test.sql`.
- Ціна скупника стає поточною, коли однакову внесли кілька різних гравців за вікно часу (кількість і вікно — `price_rules`, змінює адмін).

## Налаштування (один раз)

### 1. Supabase
1. [supabase.com](https://supabase.com) → **New project** (регіон — Frankfurt або найближчий). Збережи пароль бази.
2. **SQL Editor** → по черзі запусти файли з `supabase/migrations/` (від `0001_init.sql` за номером) → **Run**.
3. Адреса проєкту й publishable key уже записані в `.env.production` — обидва значення публічні.

### 2. Discord (вхід)
1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application** → назва «Q-Hub».
2. **OAuth2**: скопіюй **Client ID**, натисни **Reset Secret**, скопіюй **Client Secret**.
3. **OAuth2 → Redirects** → додай адресу з Supabase: **Authentication → Sign In / Providers → Discord**
   (виглядає як `https://<проєкт>.supabase.co/auth/v1/callback`).
4. У Supabase: **Authentication → Providers → Discord** → увімкни, встав Client ID і Client Secret → **Save**.
5. **Authentication → URL Configuration**: **Site URL** = `https://q-hub.fun`; у **Redirect URLs** додай
   `https://q-hub.fun/**` і `http://localhost:5173/**` (для розробки).

### 3. GitHub → автодеплой на Hostiq
**Settings → Secrets and variables → Actions → New repository secret**:

| Секрет | Звідки |
|---|---|
| `FTP_SERVER` | Hostiq → панель → FTP (наприклад `ftp.q-hub.fun`) |
| `FTP_USERNAME`, `FTP_PASSWORD` | FTP-акаунт Hostiq |
| `FTP_DIR` | папка сайту відносно входу FTP; за замовчуванням `./` (наприклад `./public_html/`) |

Після цього кожен push у `main` перевіряє тести, правила бази, збирає сайт і викладає його на Hostiq.
Без FTP-секретів крок деплою пропускається, а збірка й тести працюють як і раніше.

### 4. Перше використання
1. Відкрий `https://q-hub.fun` → **Увійти через Discord**.
2. Зроби себе адміністратором. У Supabase **SQL Editor**:
   `update public.profiles set role = 'admin' where name = 'твоє_ім'я_в_Discord';`

## Розробка

```
cp .env.example .env    # встав свої VITE_SUPABASE_URL і VITE_SUPABASE_ANON_KEY
npm install
npm run dev             # http://localhost:5173
npm test                # склад/собівартість, івенти, розбір сум
bash supabase/tests/run.sh   # правила доступу на локальному PostgreSQL
npm run build           # → dist/
```
