# Data Model: Таймер заробітку на роботі

## Вимір (`Measure`) — `settings.jobTimer` (поточний) і `jobtimer.json` (історія)

| Поле | Тип | Правила |
|---|---|---|
| `id` | string | випадковий, унікальний; потрапляє в `source_note` пропозиції |
| `char` | string | ключ персонажа (як у `moneyKey()`); зміна персонажа → автостоп |
| `state` | `'wait' \| 'run' \| 'pause' \| 'done'` | див. переходи |
| `startedAt` | number (ms) | момент старту |
| `runMs` | number | чистий час без пауз, ≥ 0 |
| `runFrom` | number \| null | початок поточного відрізка `run`; `null` у `pause`/`done` |
| `last` | number \| null | останній баланс (готівка + картка) у стані `run` |
| `lastAt` | number \| null | час останнього зчитування |
| `gain` | number | сума зростань балансу за `run`, ≥ 0 |
| `flag` | boolean | був стрибок понад `max_jump` |
| `blindMs` | number | час `run` без зчитувань > 15 с |
| `interrupted` | boolean | програму закрили посеред відліку |
| `label` | `Label \| null` | підпис виміру; `null` — «Без підпису» (FR-009) |
| `endedAt` | number \| null | момент стопу |
| `sent` | `{ at, proposalId, status? } \| null` | надіслано в довідник; `status` — `pending/accepted/accepted_edited/rejected` |

### Підпис (`Label`)

```ts
type Label =
  | { kind: 'job'; id: string; name: string; level: number | null }   // робота з довідника; level — рівень навички
  | { kind: 'own'; name: string };                                     // власний замір
```

| Поле | Правила |
|---|---|
| `job.id` | `jobs.id` з довідника (кеш списку) |
| `job.name` | назва роботи на момент підпису (лишається, навіть якщо роботу приховали) |
| `job.level` | ціле `1…100` або `null` — «рівень не вказано»; інше значення поле не приймає |
| `own.name` | `trim()`, `1…60` знаків; порожня — не зберігається як власний; довша — обрізається до 60 |

**Ключ групи для середнього** (FR-010): `job:<id>:<level ?? '-'>` для роботи, `own:<name.trim().toLowerCase()>` для власного, `none` — без підпису. Різні рівні однієї роботи — різні групи.

**Підстановка** (FR-010a): `lastLabel` персонажа — підпис останнього підписаного виміру; зберігається в `settings.jobTimerLast[char]`.

### Похідні

- `perHour = runMs ≥ 60 000 ? round(gain / (runMs / 3 600 000)) : null` (FR-005).
- `canPropose = state='done' && label?.kind==='job' && label.level !== null && jobExists(label.id) && runMs ≥ 600 000 && !flag && !sent` (FR-014); інакше — причина за порядком перевірки: `sent` / `no-label` / `own` / `no-level` / `gone` (роботи вже немає в довіднику) / `short` / `flag` / `login` / `offline`.

### Переходи стану

```
(немає) --старт--> wait --перший баланс--> run
run --пауза--> pause --продовжити--> run      (last := поточний баланс при продовженні; зміни за паузу не рахуються)
run|pause|wait --стоп--> done                  (runMs фіксується)
run --зміна персонажа--> done
run --перезапуск програми--> pause + interrupted
done --зберегти/закрити--> історія
```

### Оновлення балансу в `run` (FR-006, FR-007)

`d = total − last`; `|d| > max_jump` → `flag = true`; інакше `d > 0` → `gain += d`; далі `last = total`, `lastAt = at`. У `pause`/`wait`/`done` зчитування лише запам'ятовується як «поточний баланс» (для продовження чи першого старту).

## Історія (`jobtimer.json`)

- Масив `Measure` у стані `done`, новіші першими, не більше 200 (старіші відкидаються).
- Середнє по групі (ключ підпису вище): `Σgain ÷ Σ(runMs / 3 600 000)`, лише виміри з `runMs ≥ 60 000` і без `flag` (FR-010). Рядок групи: назва («Ферма · рівень 3», «Ферма · рівень не вказано», «риболовля на пірсі», «Без підпису»), кількість вимірів, сумарний час, $/год.
- Видалення й зміна підпису — за `id`; після зміни підпису `sent` не скидається (надісланий вимір перепідписати не можна — поле підпису для нього лише для читання).

## Пропозиція заробітку → `public.wiki_proposals` (наявна таблиця)

Див. [contracts/wage-proposal.md](contracts/wage-proposal.md). Обмеження з бази: `data.pay` ≤ 300 знаків (`wiki_clean`), `source_note` ≤ 300, ліміт на розгляді `wiki_settings.max_pending` (QH002), бан (QH001), робота існує (QH014).
