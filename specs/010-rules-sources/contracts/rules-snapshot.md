# Contract: знімок правил `rules.json`

Публічно: `<SUPABASE_URL>/storage/v1/object/public/rules/rules.json`. Той самий формат — у вбудованій `src/data/rules.json`.

```ts
interface Snapshot { fetched: string /* ISO або РРРР-ММ-ДД */; topics: Topic[] }
interface Topic {
  title: string;     // «Кримінальний кодекс штату Quant»
  section: string;   // «Законодавча база Штату»
  url: string;       // тема форуму
  kind?: 'rules' | 'law' | 'order';   // нема — 'rules' (стара вбудована копія)
  items: { n: string /* «6.5», «» */; h: string /* «Стаття 6. Злочини проти власності» */; s: string }[];
}
```

- Програма й плашка мусять приймати знімок без `kind` (стара копія) — як `rules`.
- Розмір — до ~3 МБ; програма кешує з ETag.
