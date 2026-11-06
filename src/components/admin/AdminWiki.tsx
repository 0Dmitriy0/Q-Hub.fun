import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { dbError } from '../../lib/wiki';
import { useAuth } from '../../lib/auth';
import AdminSection from './AdminSection';

/* «Довідник» в адмінці (specs/043): розбір пропозицій, прибрані сторінки й заборони — в одному місці, у панелі /panel (specs/061).
   Тут — скільки чекає, переходи в панель і налаштування довідника, які бачить тільки admin (рішення власника 2026-11-06) */
export default function AdminWiki({ pending }: { pending: number | null }) {
  return (
    <>
      <AdminSection title="Пропозиції від гравців" hint="Розбір, прибрані сторінки й заборони — у панелі модераторів: там те саме бачать і модератори.">
        <div className="row">
          <Link to="/panel/rozbir" className="btn acc sm">{pending ? `Розібрати (${pending})` : 'Відкрити розбір'}</Link>
          <Link to="/panel/rishennia" className="btn ghost sm">Мої рішення</Link>
          <Link to="/panel/prybrani" className="btn ghost sm">Прибрані й заборони</Link>
        </div>
      </AdminSection>
      <Settings />
    </>
  );
}

/* налаштування довідника (лише admin) і прибирання старих скрінів-доказів (FR-024) */
type Conf = { max_pending: number; stale_days: number; proof_days: number };
function Settings() {
  const { role } = useAuth();
  const [f, setF] = useState<Conf | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase!.from('wiki_settings').select('max_pending,stale_days,proof_days').maybeSingle().then(({ data }) => setF(data as Conf | null)); }, []);
  if (role !== 'admin' || !f) return null;
  const num = (k: keyof Conf, label: string, hint: string, max: number) => (
    <label className="fld">{label}<input type="number" min={1} max={max} value={f[k]} onChange={e => setF({ ...f, [k]: Number(e.target.value) })} /><small className="muted">{hint}</small></label>);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!f) return;
    if (!(f.max_pending >= 1 && f.max_pending <= 100)) { setMsg('Ліміт пропозицій — від 1 до 100.'); return; }
    if (!(f.stale_days >= 1 && f.stale_days <= 365 && f.proof_days >= 1 && f.proof_days <= 365)) { setMsg('Дні — від 1 до 365.'); return; }
    setBusy(true);
    const { error } = await supabase!.from('wiki_settings').update(f).eq('id', true);
    setBusy(false); setMsg(error ? dbError(error) : 'Збережено.');
  }
  /* файли вирішених пропозицій, старших за proof_days; видалення того, чого вже немає, нічого не ламає */
  async function clean() {
    if (!f) return;
    setBusy(true); setMsg('');
    const before = new Date(Date.now() - f.proof_days * 86_400_000).toISOString();
    const { data } = await supabase!.from('wiki_proposals').select('proof_path').neq('proof_path', '').not('decided_at', 'is', null).lt('decided_at', before).limit(1000);
    const paths = ((data ?? []) as { proof_path: string }[]).map(r => r.proof_path);
    let n = 0;
    for (let i = 0; i < paths.length; i += 100) { const { data: r } = await supabase!.storage.from('wiki-proof').remove(paths.slice(i, i + 100)); n += r?.length ?? 0; }
    setBusy(false); setMsg(`Прибрано скрінів: ${n}.`);
  }
  return (
    <AdminSection title="Налаштування довідника">
      <form className="form" onSubmit={save} noValidate>
        <div className="adm-form-row">
          {num('max_pending', 'Пропозицій на розгляді від одного гравця', 'Більше — гравець чекає рішення по наявних.', 100)}
          {num('stale_days', '«Може бути застарілим» через, днів', 'Для позначки на картках (наступний реліз).', 365)}
          {num('proof_days', 'Зберігати скріни-докази, днів', 'Після рішення скрін видаляється одразу; це — запас.', 365)}
        </div>
        <div className="row">
          <button className="btn acc" disabled={busy}>Зберегти</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={clean}>Прибрати скріни старші {f.proof_days} днів</button>
          {msg && <p className={/^(Збережено|Прибрано)/.test(msg) ? 'good' : 'err'} role="status">{msg}</p>}
        </div>
      </form>
    </AdminSection>
  );
}

