# Contract: легка розмітка відповідей і `<Rich>`

## 1. Що ШІ може писати (вихід асистента)

| Розмітка | Приклад | Показ |
|---|---|---|
| Абзац | порожній рядок між реченнями | окремий абзац з проміжком |
| Список | `- пункт` / `• пункт` / `1. пункт` з нового рядка | маркований / нумерований список |
| Жирне | `**5 000 $**` | жирний текст, без зірочок |
| Посилання на пункт | `(Кримінальний кодекс, ст. 6.5)` | позначка `.bcite` |

Заборонено (показується як текст / зрізається): заголовки `#`, таблиці, вкладені списки, посилання `[]()`, HTML.

## 2. `src/desktop/richText.ts`

```ts
export type Span = { t: 'text' | 'bold'; v: string };
export type Block = { t: 'para'; spans: Span[] } | { t: 'list'; ordered: boolean; items: Span[][] };
export function parseRich(text: string): Block[];
export function plainText(text: string): string; // для буфера: без **, пункти «• » / «N. », абзаци через \n\n
```

Гарантії: чисті функції; не кидають винятків на будь-якому рядку; `plainText(t)` не містить `**`.

## 3. `<Rich>` у `barParts.tsx`

```ts
<Rich text={string} cite?={boolean} clamp?={boolean} />
```

- Рендер: `<div class="rich">` з `<p>`, `<ul>`/`<ol>`/`<li>`, `<strong>`; лише React-вузли.
- `cite` (типово `true`) — позначки пунктів через `cites()`.
- `clamp` — згорнутий вигляд по висоті (~4 рядки) з згасанням.
- Текст виділюваний (`user-select: text` там, де зараз).

## 4. Місця використання

| Місце | Було | Стане |
|---|---|---|
| `Bar.tsx` відповідь ШІ | `cites(a.reply)` у `.bans` | `<Rich text={a.reply} />`; копіювання — `plainText(a.reply)` |
| `RuleWin.tsx` правило/ШІ | `<p>{ai ? cites(body) : body}</p>` | `<Rich text={body} cite={ai} />` |
| `RuleCard` (плашка, демо сайту) | `<p className=clamp>{body}</p>` | `<Rich text={body} cite={false} clamp={long && !open} />` |
