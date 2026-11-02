import { useState } from 'react';
import { supabase } from '../lib/supabase';

/* форма промокоду Q-Hub (specs/022): на головній і в адмін-панелі (specs/039); права перевіряє база (0031) */
export type SitePromoRow = { code: string; reward: string; note: string; enabled: boolean };

export default function PromoForm({ p, done }: { p: SitePromoRow; done: () => void }) {
  const [f, setF] = useState(p);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: 'code' | 'reward' | 'note') => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = { code: f.code.trim(), reward: f.reward.trim(), note: f.note.trim(), enabled: f.enabled, updated_at: new Date().toISOString() };
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(v.code)) return setMsg('Промокод — латиниця й цифри, без пробілів.');
    if (!v.reward) return setMsg('Напиши, що гравець отримає.');
    setBusy(true);
    const { error } = await supabase!.from('site_promo').upsert({ id: true, ...v });
    setBusy(false);
    if (error) return setMsg(/row-level|permission/i.test(error.message) ? 'Змінювати промокод Q-Hub може лише адмін.' : 'Не вдалося зберегти: ' + error.message);
    done();
  }
  return (
    <form className="form svform qpromo qpromo-form" onSubmit={save} aria-label="Промокод Q-Hub">
      <label className="fld">Промокод<input value={f.code} onChange={set('code')} maxLength={40} autoFocus /></label>
      <label className="fld">Умова (необов'язково)<input value={f.note} onChange={set('note')} maxLength={300} placeholder="порожньо — без умови" /></label>
      <label className="fld wide">Що отримаєш<input value={f.reward} onChange={set('reward')} maxLength={200} /></label>
      <label className="mcheck wide"><input type="checkbox" checked={f.enabled} onChange={e => setF(x => ({ ...x, enabled: e.target.checked }))} />Показувати на головній</label>
      <div className="row wide"><button className="btn acc" disabled={busy}>Зберегти</button><button type="button" className="btn ghost" onClick={done}>Скасувати</button></div>
      {msg && <p className="err wide" role="alert">{msg}</p>}
    </form>
  );
}
