# Data Model: 005-promo-ghosts-map

Нових таблиць і полів немає. Функція читає наявні дані й керує станом інтерфейсу.

## MapCategory (база, `map_categories`, лише читання)

| Поле | Значення для функції |
|---|---|
| `id` | `pryvydy` у живій базі (у міграції `0015` — `ghosts`, див. research R3) |
| `grp` | «Міні-ігри, квести й контракти»: група, вимкнена за замовчуванням |

## MapPoint (база, `map_points`, лише читання)

`category_id = only`. Кількість > 0 — умова, за якої вид «лише привиди» вмикається (FR-008).

## Стан мапи (клієнт)

| Стан | Де живе | Чи зберігається |
|---|---|---|
| `only: string \| null` | React-стан `MapPage` | Ні. Джерело — `?show=` в адресі, яка одразу очищається |
| `on: Record<id, boolean>` | React-стан | Так, `localStorage[ON_KEY]`, лише після дії гравця |
| `saved` | `localStorage[ON_KEY]` | Лише читається |

### Видимість категорії

```text
only ≠ null  → c.id === only || c.id === 'names'
only = null  → on[c.id] ?? saved[c.id] ?? DEFAULT_GROUPS.has(c.grp)
```

### Переходи `only`

```text
?show=<id> у адресі (і supabase є)      → only = <id>
loadMapData: даних немає                 → only = null
loadMapData: у категорії 0 міток         → only = null
гравець перемкнув будь-який фільтр       → on = {...saved, ...on, ...видиме_зараз, перемкнуте}; saveOn(on); only = null
«Скинути фільтри»                        → only = null; on = за замовчуванням
оновлення сторінки                       → only = null (параметра в адресі вже немає)
```
