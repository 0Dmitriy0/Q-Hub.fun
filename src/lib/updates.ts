/* Стрічка «Останні оновлення»: усе, що один гравець вніс у одного скупника одним заходом
   (між сусідніми внесеннями не більше 30 хв), складається в один запис.
   Одна ціна показується з ціною, кілька — списком назв. */
export interface Update {
  id: number; buyer_id: string; item_id: number; price: number; created_at: string;
  /* зведення price_updates (0038): нік акаунта й Ім'я_Прізвище персонажа, з якого вписано ціну; статіку там немає */
  reporter_id?: string; reporter_name: string; reporter_character?: string | null;
}
export interface UpdateGroup { key: string; who: string; buyer_id: string; at: string; items: Update[] }

export const GAP = 30 * 60000;
/* хто вніс (specs/025 FR-016): «D_VYRX · Dmitriy_Core»; без персонажа (старі ціни) — лише нік */
export const who = (u: Pick<Update, 'reporter_name' | 'reporter_character'>) => {
  const n = (u.reporter_name || '').trim() || 'гравець', c = (u.reporter_character || '').trim();
  return c ? `${n} · ${c}` : n;
};

export function groupUpdates(ups: Update[]): UpdateGroup[] {
  const sorted = [...ups].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  type G = UpdateGroup & { last: number };
  const open = new Map<string, G>(), out: G[] = [];
  for (const u of sorted) {
    /* один захід — той самий акаунт, персонаж і скупник */
    const id = `${u.reporter_id ?? u.reporter_name}|${u.reporter_character ?? ''}|${u.buyer_id}`, t = new Date(u.created_at).getTime();
    const g = open.get(id);
    if (g && g.last - t <= GAP) { g.items.push(u); g.last = t; continue; }
    const ng = { key: id + '|' + u.id, who: who(u), buyer_id: u.buyer_id, at: u.created_at, items: [u], last: t };
    open.set(id, ng); out.push(ng);
  }
  return out.map(({ last: _last, ...g }) => g);
}
