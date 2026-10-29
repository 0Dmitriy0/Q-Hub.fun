import { useEffect, useState } from 'react';
import Icon from './Icon';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

/* власний промокод Q-Hub на QuantRP (specs/022) — окремо від промокодів сервера, на першому екрані головної.
   Код і нагорода — з public.site_promo (змінює лише admin); поки база не відповіла чи таблиці ще немає — QHUB */
type SitePromoRow = { code: string; reward: string; note: string; enabled: boolean };
const FALLBACK: SitePromoRow = { code: 'QHUB', reward: 'Отримайте 50.000$ та +1 рівень.', note: '', enabled: true };
const promoCommand = (code: string) => `/promo ${code.toLowerCase()}`;

export default function SitePromo() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [p, setP] = useState<SitePromoRow>(FALLBACK);
  const [edit, setEdit] = useState(false);
  const load = () => supabase?.from('site_promo').select('code,reward,note,enabled').maybeSingle()
    .then(({ data }) => { if (data) setP(data as SitePromoRow); });
  useEffect(() => { load(); }, []);

  if (edit) return <PromoForm p={p} done={() => { setEdit(false); load(); }} />;
  if (!p.enabled && !isAdmin) return null;
  const cmd = promoCommand(p.code);
  return (
    <section className={'qpromo' + (p.enabled ? '' : ' off')} aria-label="Промокод Q-Hub">
      <div className="qpromo-main">
        <span className="qpromo-tag">Промокод від Q-Hub на QuantRP{!p.enabled && ' · вимкнено, бачить лише адмін'}</span>
        <b className="qpromo-code mono">{p.code}</b>
        <span className="qpromo-reward">{p.reward}</span>
        {p.note && <span className="qpromo-note">{p.note}</span>}
        <span className="qpromo-how">Введи в телефоні або командою <code>{cmd}</code> у чаті</span>
      </div>
      <div className="qpromo-act">
        <CopyBtn text={p.code} label="Скопіювати" acc />
        <CopyBtn text={cmd} label="Скопіювати команду" />
        {isAdmin && <button type="button" className="btn ghost sm" onClick={() => setEdit(true)}>Змінити</button>}
      </div>
    </section>
  );
}

function CopyBtn({ text, label, acc }: { text: string; label: string; acc?: boolean }) {
  const [st, setSt] = useState<'' | 'ok' | 'fail'>('');
  async function copy() {
    try { await navigator.clipboard.writeText(text); setSt('ok'); } catch { setSt('fail'); }
    setTimeout(() => setSt(''), 1500);
  }
  return (
    <button type="button" className={'btn sm ' + (acc ? 'acc' : 'ghost')} onClick={copy} aria-live="polite">
      <Icon name={st === 'ok' ? 'check' : 'copy'} size={16} />{st === 'ok' ? 'Скопійовано' : st === 'fail' ? 'Скопіюй вручну' : label}
    </button>
  );
}

function PromoForm({ p, done }: { p: SitePromoRow; done: () => void }) {
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
