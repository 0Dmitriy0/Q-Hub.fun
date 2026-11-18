# Data Model: Глосарій RP-термінів

Міграція `supabase/migrations/0080_glossary.sql` (ідемпотентна).

## glossary_terms

| Поле | Тип | Правила |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| term | text | скорочення кирилицею, 1–12 символів після trim, обов'язкове |
| aliases | text[] default '{}' | латинське скорочення, синоніми; кожен 1–80 символів, до 20 штук |
| full_name | text default '' | повна назва, ≤ 80 |
| description | text | 1–300 символів, обов'язкове |
| related_rules | text[] default '{}' | «<скорочення документа> <номер>», кожен ≤ 40, до 10 штук |
| hidden | boolean default false | прибраний |
| version | int default 1 | номер поточної версії |
| updated_by | uuid → profiles on delete set null | |
| updated_at | timestamptz default now() | |

**Унікальність** (перевіряє `glossary_save`, без регістру, серед не прихованих): кожна назва (`term`, кожен `aliases[i]`, `full_name`) не може бути назвою іншого терміну — крім однакового `term` у двох записів з різними непорожніми `full_name` (ТК — Team Kill / Трудовий кодекс).

RLS: `select using (not hidden or public.is_wiki_mod())`; запису напряму немає.

## glossary_versions

| Поле | Тип | Правила |
|---|---|---|
| id | bigint identity PK | |
| term_id | uuid → glossary_terms on delete cascade | |
| version_no | int | 1, 2, … у межах терміну; unique (term_id, version_no) |
| action | text | `create` \| `edit` \| `hide` \| `unhide` \| `revert` |
| data | jsonb | знімок терміну **після** дії: term, aliases, full_name, description, related_rules, hidden |
| author | uuid → profiles on delete set null | |
| created_at | timestamptz default now() | |

RLS: `select using (public.is_wiki_mod())`.

## Формат JSON (`src/data/glossary.json`, і відповідь `glossary_terms` для клієнта)

```json
{ "terms": [
  { "term": "ДМ", "aliases": ["DM", "DeathMatch", "дезматч", "вбивство без причини"], "full_name": "DeathMatch",
    "description": "Вбивство без RP-причини.", "related_rules": ["ЗП 6.9"] }
] }
```

## Тип у коді

`GlossaryTerm = { term: string; aliases: string[]; full_name: string; description: string; related_rules: string[] }` — у `src/desktop/rulesSearch.ts` (пошук отримує масив параметром).

## Початковий список (seed і JSON однакові)

ДМ, ДБ, СК, ТК (Team Kill), ТК (Трудовий кодекс), РП, МГ, ГМ, ПГ, РК, БХ, КК, АК (Адміністративний кодекс), ЗЗ, а також з наявного коду: ПДР / ДК (Дорожній кодекс), ПК (Процесуальний кодекс), НРД (NRD), Деморган, Ганбан, Варн. Пояснення — з опису функції власника; `related_rules` для термінів з однозначним пунктом у вбудованій копії правил (заповнюється під час реалізації за `rules.json`).
