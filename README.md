# Q-Hub.fun

Фан-сайт і програма для гравців QuantRP:
- **сайт** — ціни скупників і ринку гравців (перевіряють самі гравці), івенти, транспорт, роботи, мапа;
- **кабінет** — облік, угоди й чеки, склад із собівартістю, гараж персонажа (бачить лише власник);
- **програма Q-Hub Desktop** — `Alt+Q` поверх гри, баланс з екрана → облік.

План і етапи: [docs/PLAN.md](docs/PLAN.md).

## Як влаштовано

- Статичний сайт (Vite + React + TypeScript). Збирається в папку `dist/`, яка працює на будь-якому хостингу, зокрема Hostiq.
- Дані, вхід через Discord і правила доступу — у **Supabase**. Особисте захищене на рівні бази (Row Level Security):
  навіть з публічним ключем чужий облік не прочитати. Перевіряє `supabase/tests/rls_test.sql`.
- Ціна скупника «підтверджена», коли її повідомили щонайменше 3 різні гравці за 48 год, а викиди відкинуто.

## Налаштування (один раз)

### 1. Supabase
1. [supabase.com](https://supabase.com) → **New project** (регіон — Frankfurt або найближчий). Збережи пароль бази.
2. **SQL Editor** → встав увесь вміст `supabase/migrations/0001_init.sql` → **Run**.
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
2. **Кабінет → Імпорт з хабу**: у Quant Hub натисни «Зберегти копію», обери файл, «Перенести».
   Переїдуть облік, угоди з чеками, гараж, документи й ігрові сесії. Повторний імпорт нічого не дублює.
3. Зроби себе адміністратором. У Supabase **SQL Editor**:
   `update public.profiles set role = 'admin' where name = 'твоє_ім'я_в_Discord';`

## Мітки з гри (F9)

Редактори наповнюють мапу прямо з гри ([specs/001-map-pin-drafts](specs/001-map-pin-drafts/spec.md)):
1. У грі відкрий велику карту, стань на місце мітки й натисни **F9** у програмі Q-Hub.
2. Програма знімає екран, сама знаходить точку на мапі й показує знімок — можна одразу обрати категорію й опис.
   Точку не знайдено — чернетка йде без неї, точку поставить адмін.
3. Чернетка з'являється на сайті: **Мапа → Адмін → Чернетки з F9**. Адмін ставить чи пересуває точку,
   бачить «Поруч уже є», якщо в 30 м уже є така мітка, і публікує або відхиляє.

- F9 працює лише для ролей **editor**, **moderator** і **admin** — у гравців клавіша лишається грі.
- Змінити клавішу: `Alt+Q` → шестерня «Налаштування плашки» → **Мітка з гри** (зайнята клавіша не приймається).
- Знімок бачать лише **admin** і автор чернетки; через 30 днів після обробки він видаляється.
- Без інтернету чернетки чекають у локальній черзі (`%APPDATA%\Q-Hub\drafts\`) і відправляються пізніше.

## Розробка

```
cp .env.example .env    # встав свої VITE_SUPABASE_URL і VITE_SUPABASE_ANON_KEY
npm install
npm run dev             # http://localhost:5173
npm test                # склад/собівартість, імпорт хабу, івенти, розбір сум
bash supabase/tests/run.sh   # правила доступу на локальному PostgreSQL
npm run build           # → dist/
```
