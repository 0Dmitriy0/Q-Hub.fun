# Contract: IPC таймера

Стан тримає головний процес (`main.cjs` + `jobtimer.cjs`); вікно таймера лише малює `TimerView` і шле команди. Кожен канал перевіряє відправника (`fromTimer(e)` / `fromBar(e)`), як канали вікна правил.

## Головний процес → вікно таймера

| Подія | Дані | Коли |
|---|---|---|
| `timer-view` | `TimerView` | при кожній зміні стану й раз на 1 с у `run` (лише для секунд — без запису на диск) |

```ts
type TimerView = {
  state: 'wait' | 'run' | 'pause' | 'done';
  runMs: number; gain: number; perHour: number | null;
  flag: boolean; blindMs: number; blind: boolean;   // blind — зараз баланс не видно (> 15 с)
  interrupted: boolean;
  label: Label | null;                              // data-model.md: робота + рівень / власний замір
  suggest: Label | null;                            // підстановка з останнього підписаного виміру (FR-010a)
  free: boolean;                                    // Alt+Q відкрита — кнопки й перетягування активні
  streamer: boolean;
  canPropose: boolean;
  why: '' | 'sent' | 'no-label' | 'own' | 'no-level' | 'gone' | 'short' | 'flag' | 'login' | 'offline';
  sent: { at: number; status?: string } | null;
};
```

## Вікно таймера → головний процес (`ipcRenderer.invoke`)

| Канал | Аргументи | Відповідь |
|---|---|---|
| `timer-state` | — | `TimerView` |
| `timer-cmd` | `'pause' \| 'resume' \| 'stop' \| 'close'` | `TimerView` |
| `timer-jobs` | — | `{ id, name }[]` (з бази чи кешу) |
| `timer-label` | `{ id?: string; label: Label \| null }` — без `id` поточний вимір, з `id` — вимір з історії | `TimerView` чи історія; невалідний підпис (рівень поза 1–100, порожня назва) — `{ ok: false, error }` |
| `timer-history` | — | `{ items: Measure[]; groups: { key, title, n, runMs, gain, perHour }[] }` (і оновлює `sent.status` з бази) |
| `timer-delete` | `id` | історія |
| `timer-propose` | `id` (вимір з історії чи поточний `done`) | `{ ok: true } \| { ok: false; error: string }` — текст помилки бази (QH001/QH002/QH014) як є |

## Плашка → головний процес

| Канал | Що робить |
|---|---|
| `timer-toggle` | те саме, що натискання `timerKey` (FR-002, FR-003) |

## Гаряча клавіша

`prefs.timerKey` (типово `Alt+T`) → `timerPressed()`: немає виміру → показати вікно, `wait`; `wait/run/pause` → `stop`; `done` → закрити вікно (вимір уже в історії).
