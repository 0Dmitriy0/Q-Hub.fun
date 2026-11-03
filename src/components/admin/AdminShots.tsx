import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { OLD_SHOT_DAYS, adminError, isOldShot, shotMeta, when } from '../../lib/admin';
import AdminSection from './AdminSection';

/* Навчальні знімки (specs/039 US4, конституція III): з Alt+S → «Поділитися з розробниками».
   Файли — лише тимчасовими посиланнями на 10 хв; публічного посилання немає. Порції по 50 */
type Shot = { name: string; created_at: string; nick: string | null; url?: string; label?: string; note?: string; version?: string; missing?: boolean };
const PAGE = 50;
/* мітки — ті самі, що в програмі (desktop/src/shots.cjs); невідома — як є */
const LABELS: Record<string, string> = { buyer: 'Вікно скупника', sell: 'Продаж / чек', buy: 'Купівля', bank: 'Банк / баланс', job: 'Зарплата / робота', other: 'Інше' };

export default function AdminShots() {
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [err, setErr] = useState('');
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const page = useCallback(async (before: string | null) => {
    setLoading(true); setErr('');
    const { data, error } = await supabase!.rpc('admin_training_shots', { p_before: before, p_limit: PAGE });
    if (error) { setLoading(false); setErr(adminError(error)); return; }
    const rows = (data || []) as Shot[];
    const store = supabase!.storage.from('training');
    const [signed, metas] = await Promise.all([
      rows.length ? store.createSignedUrls(rows.map(r => r.name), 600) : Promise.resolve({ data: [] as { signedUrl: string | null }[] }),
      Promise.all(rows.map(r => store.download(shotMeta(r.name).json).then(async ({ data: b }) => {
        try { return b ? JSON.parse(await b.text()) : null; } catch { return null; }
      }))),
    ]);
    const full = rows.map((r, i) => {
      const url = signed.data?.[i]?.signedUrl || undefined;
      const m = metas[i] || {};
      return { ...r, url, missing: !url, label: m.label, note: m.note, version: m.version };
    });
    setShots(s => (before ? [...(s || []), ...full] : full));
    setMore(rows.length === PAGE);
    setLoading(false);
  }, []);
  useEffect(() => { page(null); }, [page]);

  const list = (shots || []).filter(s => !label || (label === '-' ? !s.label : s.label === label));
  const labels = [...new Set((shots || []).map(s => s.label).filter((l): l is string => !!l))].sort();
  const toggle = (n: string) => setSel(s => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  async function remove(names: string[]) {
    if (!names.length || !window.confirm(names.length === 1 ? 'Видалити цей знімок назавжди?' : `Видалити ${names.length} знімків назавжди?`)) return;
    const { error } = await supabase!.storage.from('training').remove(names.flatMap(n => [n, shotMeta(n).json]));
    if (error) { setMsg(adminError(error)); return; }
    setShots(s => (s || []).filter(x => !names.includes(x.name)));
    setSel(new Set()); setView(null); setMsg(`Видалено: ${names.length}.`);
  }

  const old = (shots || []).filter(s => isOldShot(s.created_at)).length;
  return (
    <AdminSection title="Навчальні знімки" loading={!shots && !err} error={err} onRetry={() => page(null)}
      hint={`На знімках бувають чат і ніки інших гравців — тримаємо лише потрібні для навчання зору. Старші за ${OLD_SHOT_DAYS} днів позначені «старий».`}
      actions={sel.size > 0 && <button type="button" className="btn bad sm" onClick={() => remove([...sel])}>Видалити вибрані ({sel.size})</button>}>
      <div className="adm-filter">
        <label className="fld">Мітка
          <select value={label} onChange={e => setLabel(e.target.value)}>
            <option value="">усі</option>
            {labels.map(l => <option key={l} value={l}>{LABELS[l] || l}</option>)}
            <option value="-">без мітки</option>
          </select>
        </label>
        {old > 0 && <span className="pill warn">Старих: {old}</span>}
        {msg && <span className="muted" role="status">{msg}</span>}
      </div>
      {shots && !list.length && <p className="adm-empty">{shots.length ? 'З такою міткою знімків немає.' : 'Знімків ще немає.'}</p>}
      <ul className="adm-shots">
        {list.map(s => {
          const i = list.indexOf(s);
          return (
            <li key={s.name} className={'adm-shot' + (sel.has(s.name) ? ' on' : '')}>
              {s.missing
                ? <div className="adm-shot-img adm-gone">файл видалено</div>
                : <button type="button" className="adm-shot-img" onClick={() => setView(i)} aria-label={`Відкрити знімок від ${s.nick || 'гравця'}`}><img src={s.url} alt="" loading="lazy" /></button>}
              <div className="adm-shot-meta">
                <label className="mcheck"><input type="checkbox" checked={sel.has(s.name)} onChange={() => toggle(s.name)} /><b>{s.label ? LABELS[s.label] || s.label : 'без мітки'}</b></label>
                {s.note && <span>{s.note}</span>}
                <span className="muted">{s.nick || 'невідомий'} · {when(s.created_at)}{s.version ? ' · v' + s.version : ''}</span>
                {isOldShot(s.created_at) && <span className="pill warn">старий — видали, якщо вже не потрібен</span>}
                {s.missing && <button type="button" className="btn ghost sm" onClick={() => remove([s.name])}>Прибрати</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {more && <button type="button" className="btn ghost" disabled={loading} onClick={() => page(shots![shots!.length - 1].created_at)}>{loading ? 'Вантажу…' : 'Показати ще'}</button>}
      {view !== null && list[view] && <Viewer list={list} i={view} onGo={setView} onClose={() => setView(null)} onDelete={n => remove([n])} />}
    </AdminSection>
  );
}

/* перегляд на весь екран: Esc — закрити, ←/→ — сусідні */
function Viewer({ list, i, onGo, onClose, onDelete }: { list: Shot[]; i: number; onGo: (i: number) => void; onClose: () => void; onDelete: (n: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const s = list[i];
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && i > 0) onGo(i - 1);
      if (e.key === 'ArrowRight' && i < list.length - 1) onGo(i + 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [i, list.length, onGo]);
  return (
    <dialog ref={ref} className="adm-view" onClose={onClose} aria-label="Знімок">
      <div className="adm-view-bar">
        <span>{s.label ? LABELS[s.label] || s.label : 'без мітки'} · {s.nick || 'невідомий'} · {when(s.created_at)} <span className="muted">({i + 1} з {list.length})</span></span>
        <div className="row">
          <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => onGo(i - 1)} aria-label="Попередній">←</button>
          <button type="button" className="btn ghost sm" disabled={i === list.length - 1} onClick={() => onGo(i + 1)} aria-label="Наступний">→</button>
          <button type="button" className="btn bad sm" onClick={() => onDelete(s.name)}>Видалити</button>
          <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Закрити</button>
        </div>
      </div>
      {s.note && <p className="adm-view-note">{s.note}</p>}
      {s.url ? <img src={s.url} alt={`Знімок: ${s.label || 'без мітки'}`} /> : <p className="adm-empty">Файл видалено.</p>}
    </dialog>
  );
}
