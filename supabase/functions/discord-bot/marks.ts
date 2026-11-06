/* Оголошення нових міток від гравців (0061): «Нік додав 2 мітки» з посиланнями на мапу. Чисте — без Deno й мережі.
   Ніки — лише ті, що гравець сам поставив у Q-Hub (map_point_authors), ім'я з Discord не показується. */
import type { Body } from './discord.ts';
import { COLOR, escape } from './format.ts';

export type NewMark = { id: number; author: string; category: string; name: string; x: number; y: number };

/* опис embed — до 4096 символів; міток в одному повідомленні — не більше MAX, решта — «і ще N» */
export const MAX = 15;
const DESC_MAX = 4096;

const days = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'мітку' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'мітки' : 'міток');
export const mapLink = (site: string, m: Pick<NewMark, 'x' | 'y'>) => `${site}/mapa#${Math.round(m.x)},${Math.round(m.y)},5`;

export function marksMessage(list: NewMark[], site: string): Body {
  const shown = list.slice(0, MAX);
  const by = new Map<string, NewMark[]>();
  for (const m of shown) by.set(m.author, [...(by.get(m.author) ?? []), m]);
  const blocks: string[] = [];
  for (const [author, marks] of by) {
    const lines = marks.map(m => `• ${escape(m.category)}${m.name && m.name !== m.category ? ` — ${escape(m.name)}` : ''} · [на мапі](${mapLink(site, m)})`);
    blocks.push(`**${escape(author)}** ${marks.length === 1 ? 'додав мітку' : `додав ${marks.length} ${days(marks.length)}`}:\n${lines.join('\n')}`);
  }
  let description = blocks.join('\n\n');
  if (list.length > shown.length) description += `\n\n…і ще ${list.length - shown.length} — усі на ${site}/mapa`;
  if (description.length > DESC_MAX) description = description.slice(0, DESC_MAX - 1) + '…';
  return {
    embeds: [{
      title: list.length === 1 ? 'Нова мітка від гравця' : `Нові мітки від гравців: ${list.length}`,
      url: `${site}/mapa`, description, color: COLOR,
      footer: { text: 'Додай свою: Alt+F9 у програмі Q-Hub або «Запропонувати мітку» на сайті' },
    }],
  };
}
