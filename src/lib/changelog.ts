import LOG from '../data/changelog.json';

/* журнал оновлень програми — один для «Налаштування → Журнал оновлень» у програмі й сторінки «Програма» на сайті */
export interface Entry { id: string; version?: string; pending?: boolean; title: string; added?: string[]; changed?: string[]; fixed?: string[] }
/* pending — пак ще збирається, гравцям не випущений (.github/workflows/desktop.yml): ні сайт, ні програма його не показують */
export const CHANGES = (LOG as { entries: Entry[] }).entries.filter(e => !e.pending);
export const GROUPS: ['added' | 'changed' | 'fixed', string, string][] = [['added', 'Додано', 'good'], ['changed', 'Змінено', 'warn'], ['fixed', 'Виправлено', 'acc']];
/* id — дата релізу, «.2», «.3» — другий реліз того ж дня */
export const dayOf = (id: string) => new Date(id.slice(0, 10) + 'T12:00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
