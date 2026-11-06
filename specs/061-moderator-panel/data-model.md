# Data Model: 061 Зрозуміла панель для модераторів

**Нових таблиць, колонок, функцій бази й політик немає.** Нижче — як панель читає наявні дані і які структури будує на клієнті.

## Джерела (наявні)

| Таблиця / подання | Хто читає (наявна політика) | Що бере панель |
|---|---|---|
| `wiki_proposals` | автор — свої; `moderator`, `admin` — усі | черга (`pending`, `conflict`), мої рішення (`decided_by`), історія автора |
| `wiki_versions` | усі | мої відкати й повернення (`decided_by`, `kind in revert/hide/unhide`), причина прибирання |
| `wiki_contributors` | усі | прийняті правки й сторінки автора |
| `wiki_bans` | свій рядок; модератор — усі | заборони |
| `map_drafts` | автор — свої; `admin` — усі | мої чернетки (`status`) |
| `profiles` | як зараз | ніки авторів |

## Клієнтські структури

### Завдання (`Task`)
- `kind`: `edit` (правка), `new_page`, `hide_page`, `stale_point` (map_point + hide), `new_point` (map_point + new)
- `section`: `job` | `vehicle` | `map_point`
- `conflict`: boolean (`status = 'conflict'`)
- `created_at`

**Правило**: `section = map_point` і `kind = hide` → `stale_point`; `map_point` і `new` → `new_point`; інакше за `kind`.

### Підсумок черги (`QueueSummary`) — `summarize(tasks)`
- `total`, `conflicts`, `oldest_at | null`
- `by[kind]`: число для кожного виду; виду з нулем у підсумку немає (рядок не показується)

### Фільтр черги (`QueueFilter`)
`all` | `edit` | `new_page` | `hide_page` | `stale_point` | `new_point` | `conflict`. Задається з адреси (`/panel/rozbir?f=stale_point`), щоб клік з «Чекає на тебе» вів прямо до розбору.

### Наступна пропозиція — `nextProposal(list, decidedId, filter)`
- `list` відсортований за `created_at` зростанням.
- Повертає першу після `decidedId` у фільтрі; якщо таких немає — першу у фільтрі, крім `decidedId`; якщо порожньо — `null` («Усе розібрано»).

### Моє рішення (`Decision`) — `mergeDecisions(proposals, versions)`
- `at`, `action`: `published` | `published_edited` | `rejected` | `reverted` | `hidden` | `unhidden`
- `section`, `target_id | null`, `title`, `reason`
- Злиття: пропозиції з `decided_by = я` + версії з `decided_by = я` і `kind ∈ {revert, hide, unhide}`. Версія `hide`, що має пропозицію з тим самим `version_id`, не дублюється. Сортування за `at` спаданням, перші 50.

### Мої чернетки (`DraftSummary`) — `draftCounts(rows)`
- `new`, `published`, `rejected` — числа за `status`.

### Людська помилка — `panelError(e, ctx)`
| Вхід | Текст |
|---|---|
| `QH012` | «Цю пропозицію вже розібрав <нік>.» (нік дочитується з `decided_by`; немає — «інший модератор») |
| `QH010`, row-level, permission | «У тебе більше немає прав на цю дію. Онови сторінку.» |
| інший `QH0xx` | текст бази без змін |
| мережа, усе інше | «Не вдалося зв'язатися з сайтом. Спробуй ще раз або напиши власнику.» |

## Ролі → що бачить панель

| Розділ | editor | moderator | admin |
|---|---|---|---|
| Чекає на тебе | — | так | так |
| Розбір черги | — | так | так |
| Прибрані сторінки, Заборони | — | так | так |
| Мої рішення | — | так | так |
| Мої інструменти (чернетки, межі цін, івенти) | так | так | так |
| Посилання «Адмінка» | — | — | так |
