import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { isDiscordInvite, type LinkKey } from '../lib/brand';

/* одне з трьох посилань Discord (specs/037, 0048) — змінює лише admin, база перевіряє ще раз */
export const LINK_TEXT: Record<LinkKey, { name: string; where: string }> = {
  discord_url: { name: 'Discord Q-Hub', where: 'Питання й допомога: підвал, сторінка «Програма», інструкція до мапи, налаштування програми.' },
  family_url: { name: "Discord сім'ї CORE", where: 'Підпис «by CORE» у підвалі сайту.' },
  market_url: { name: 'Торговий майданчик', where: 'Сторінка «Ціни» й підвал сайту.' },
};

export default function DiscordForm({ url, done, field = 'discord_url' }: { url: string; done: () => void; field?: LinkKey }) {
  const [v, setV] = useState(url);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const t = LINK_TEXT[field];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const u = v.trim();
    if (u && !isDiscordInvite(u)) return setMsg('Потрібне запрошення Discord: https://discord.gg/… або https://discord.com/invite/…');
    setBusy(true);
    const { error } = await supabase!.from('site_links').upsert({ id: true, [field]: u });
    setBusy(false);
    if (error) return setMsg(/row-level|permission/i.test(error.message) ? 'Змінювати посилання може лише адмін.' : 'Не вдалося зберегти: ' + error.message);
    done();
  }
  return (
    <form className="form p-link" onSubmit={save} aria-label={`Посилання: ${t.name}`}>
      <label className="fld">{t.name} — запрошення (безстрокове, без ліміту)<input value={v} onChange={e => setV(e.target.value)} placeholder="https://discord.gg/…" autoFocus /></label>
      <small className="muted">{t.where} Порожньо — кнопки немає.</small>
      <div className="row"><button className="btn acc sm" disabled={busy}>Зберегти</button><button type="button" className="btn ghost sm" onClick={done}>Скасувати</button></div>
      {msg && <p className="err" role="alert">{msg}</p>}
    </form>
  );
}
