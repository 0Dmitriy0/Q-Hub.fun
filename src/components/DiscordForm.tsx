import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { isDiscordInvite } from '../lib/brand';

/* посилання «Discord Q-Hub» для всього сайту й програми (specs/037) — змінює лише admin, база перевіряє ще раз */
export default function DiscordForm({ url, done }: { url: string; done: () => void }) {
  const [v, setV] = useState(url);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const u = v.trim();
    if (u && !isDiscordInvite(u)) return setMsg('Потрібне запрошення Discord: https://discord.gg/… або https://discord.com/invite/…');
    setBusy(true);
    const { error } = await supabase!.from('site_links').upsert({ id: true, discord_url: u });
    setBusy(false);
    if (error) return setMsg(/row-level|permission/i.test(error.message) ? 'Змінювати посилання може лише адмін.' : 'Не вдалося зберегти: ' + error.message);
    done();
  }
  return (
    <form className="form p-link" onSubmit={save} aria-label="Посилання Discord Q-Hub">
      <label className="fld">Запрошення Discord Q-Hub (безстрокове, без ліміту)<input value={v} onChange={e => setV(e.target.value)} placeholder="https://discord.gg/…" autoFocus /></label>
      <small className="muted">Видно в підвалі, тут, в інструкції до мапи й у програмі. Порожньо — кнопок Discord ніде немає.</small>
      <div className="row"><button className="btn acc sm" disabled={busy}>Зберегти</button><button type="button" className="btn ghost sm" onClick={done}>Скасувати</button></div>
      {msg && <p className="err" role="alert">{msg}</p>}
    </form>
  );
}
