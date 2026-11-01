import LOG from '../data/changelog.json';

/* журнал оновлень програми — один для «Налаштування → Журнал оновлень» у програмі й сторінки «Програма» на сайті */
export interface Entry { id: string; version?: string; title: string; added?: string[]; changed?: string[]; fixed?: string[] }
export const CHANGES = (LOG as { entries: Entry[] }).entries;
export const GROUPS: ['added' | 'changed' | 'fixed', string, string][] = [['added', 'Додано', 'good'], ['changed', 'Змінено', 'warn'], ['fixed', 'Виправлено', 'acc']];
/* id — дата релізу, «.2», «.3» — другий реліз того ж дня */
export const dayOf = (id: string) => new Date(id.slice(0, 10) + 'T12:00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
