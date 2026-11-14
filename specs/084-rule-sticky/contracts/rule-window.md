# Contract: вікно правила — IPC (specs/084)

Усі виклики через `preload.cjs` (`window.qhub`). Головний процес перевіряє відправника: виклики з плашки — `fromBar(e)`, з вікна правила — `fromRule(e)` (`e.sender === rulew.webContents`); чужі ігноруються.

## Плашка → головний процес

| Виклик | Аргумент | Дія |
|---|---|---|
| `ruleOpen(hit)` → `invoke('rule-open', hit)` | `RuleHit` без `score` | очистити поля (data-model), `addTab`, створити/показати вікно `showInactive()`, lock/unlock за видимістю плашки, розіслати стан. Повертає `true` |

## Вікно правила → головний процес

| Виклик | Аргумент | Дія |
|---|---|---|
| `ruleState()` → `invoke('rule-state')` | — | поточний `RuleWinState` (сторінка щойно завантажилась) |
| `ruleTab(id)` → `invoke('rule-tab', id)` | string | `activate`; ігнорується, коли `locked` |
| `ruleCloseTab(id)` → `invoke('rule-close-tab', id)` | string | `closeTab`; порожньо → `rulew.hide()`; ігнорується, коли `locked` |
| `ruleClose()` → `invoke('rule-close')` | — | усі вкладки геть, `rulew.hide()`; ігнорується, коли `locked` |

## Головний процес → вікно правила

| Подія | Дані | Коли |
|---|---|---|
| `onRuleState(cb)` ← `'rule-state'` | `RuleWinState` | будь-яка зміна вкладок, lock/unlock |

## Поведінка вікна (не IPC)

- Посилання на тему форуму — як у плашці: лише `https://forum.quant5.com.ua/` у браузер, решта — заборонено; навігація сторінки заборонена (`guardPage`).
- `Esc` у розблокованому вікні — повертає фокус у плашку (`bar.focus()`), вікно не закриває.
- Вихід із програми — вікно закривається разом з усіма (`before-quit`), стан вкладок не зберігається.
