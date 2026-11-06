import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { SECTION_NAME, type Section } from '../../lib/wiki';
import { age, panelError } from '../../lib/panel';
import { resetNames } from '../wiki/PageMeta';
import { makeHash } from '../../lib/mapGeo';
import AdminSection from '../admin/AdminSection';

/* прибрані сторінки (specs/043 FR-015): усі сховані картки й мітки в одному списку з причиною і «Повернути» → wiki_unhide.
   Сховану мітку мапи більше ніде не видно — тут єдине місце, звідки її можна повернути */
type HiddenRow = { section: Section; id: string; name: string; at: string; note: string; href: string };
export function Hidden() {
  const [list, setList] = useState<HiddenRow[] | null>(null);
  const [pick, setPick] = useState(''); const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(''); const [good, setGood] = useState(false); const [busy, setBusy] = useState(false);
  const key = (r: { section: Section; id: string }) => r.section + ':' + r.id;

  async function load() {
    /* без колонки hidden у мітках мапи запит міток просто нічого не дає — тоді лише роботи й транспорт */
    const [j, v, m] = await Promise.all([
      supabase!.from('jobs').select('id,name,updated_at').eq('hidden', true).limit(200),
      supabase!.from('vehicles').select('id,name,updated_at').eq('hidden', true).limit(200),
      supabase!.from('map_points').select('id,name,x,y').eq('hidden', true).limit(200),
    ]);
    type R = { id: string | number; name: string | null; updated_at?: string | null; x?: number; y?: number };
    const rows: HiddenRow[] = [
      ...((j.data ?? []) as R[]).map(r => ({ section: 'job' as Section, id: String(r.id), name: r.name ?? '', at: r.updated_at ?? '', note: '', href: '/wiki/roboty?job=' + encodeURIComponent(String(r.id)) })),
      ...((v.data ?? []) as R[]).map(r => ({ section: 'vehicle' as Section, id: String(r.id), name: r.name ?? '', at: r.updated_at ?? '', note: '', href: '' })),
      ...((m.data ?? []) as R[]).map(r => ({ section: 'map_point' as Section, id: String(r.id), name: r.name ?? '', at: '', note: '',
        href: typeof r.x === 'number' && typeof r.y === 'number' ? '/mapa' + makeHash(r.x, r.y, 6) : '' })),
    ];
    if (rows.length) {
      /* причина й час — з останньої версії «Прибрано» */
      const { data } = await supabase!.from('wiki_versions').select('section,target_id,note,created_at').eq('kind', 'hide')
        .in('target_id', rows.map(r => r.id)).order('created_at', { ascending: false }).limit(1000);
      const seen = new Set<string>();
      for (const h of (data ?? []) as { section: Section; target_id: string; note: string; created_at: string }[]) {
        const k = h.section + ':' + h.target_id; if (seen.has(k)) continue; seen.add(k);
        const r = rows.find(x => key(x) === k); if (r) { r.note = h.note; r.at = h.created_at; }
      }
    }
    rows.sort((a, b) => b.at.localeCompare(a.at));
    setList(rows);
  }
  useEffect(() => { load(); }, []);

  async function unhide(r: HiddenRow) {
    if (!reason.trim()) { setGood(false); setMsg('Напиши, чому повертаєш сторінку.'); return; }
    setBusy(true); setMsg('');
    const { error } = await supabase!.rpc('wiki_unhide', { p_section: r.section, p_target: r.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setGood(false); setMsg(panelError(error)); return; }
    resetNames(); setPick(''); setReason('');
    setGood(true); setMsg(`«${r.name}» повернуто — гравці знову її бачать.`); load();
  }

  if (!list) return null;
  return (
    <AdminSection title="Прибрані сторінки" hint="Сховані зі списків і з мапи. Історія лишається; повернути — нова версія «Повернуто».">
      {msg && <p className={good ? 'good' : 'err'} role="status">{msg}</p>}
      {list.length === 0 ? <p className="adm-empty">Прибраних сторінок немає.</p> : (
        <ul className="adm-list">{list.map(r => (
          <li key={key(r)} className="adm-row">
            <div className="adm-row-main">
              <b>{SECTION_NAME[r.section]} · {r.href ? <a href={r.href} target="_blank" rel="noopener noreferrer">{r.name || r.id}</a> : r.name || r.id}</b>
              <span className="muted">Прибрано{r.at ? ' ' + age(r.at) : ''}{r.note ? ' · ' + r.note : ''}</span>
              {pick === key(r) && (
                <div className="news-confirm">
                  <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Чому повертаєш (наприклад: повернули в гру)" aria-label={`Причина повернення: ${r.name}`} />
                  <div className="row">
                    <button type="button" className="btn acc sm" disabled={busy} onClick={() => unhide(r)}>Повернути «{r.name || r.id}»</button>
                    <button type="button" className="btn ghost sm" onClick={() => { setPick(''); setReason(''); }}>Скасувати</button>
                  </div>
                </div>)}
            </div>
            {pick !== key(r) && <button type="button" className="btn ghost sm" onClick={() => { setPick(key(r)); setReason(''); setMsg(''); }}>Повернути</button>}
          </li>))}
        </ul>
      )}
    </AdminSection>
  );
}

/* заборонені автори (specs/043 FR-013): зняти заборону */
type Ban = { user_id: string; reason: string; at: string; who: { name: string; nick: string | null } | null };
export function Bans() {
  const [list, setList] = useState<Ban[] | null>(null);
  const [msg, setMsg] = useState(''); const [good, setGood] = useState(false);
  const load = () => {
    supabase!.from('wiki_bans').select('user_id,reason,at,who:profiles!wiki_bans_user_id_fkey(name,nick)').order('at', { ascending: false })
      .then(({ data }) => setList((data ?? []) as unknown as Ban[]));
  };
  useEffect(load, []);
  async function unban(id: string) {
    const { error } = await supabase!.from('wiki_bans').delete().eq('user_id', id);
    setGood(!error); setMsg(error ? panelError(error) : 'Заборону знято.'); load();
  }
  if (!list) return null;
  return (
    <AdminSection title="Заборони" hint="Цим гравцям заборонено пропонувати правки. Причину вони бачать замість форми.">
      {msg && <p className={good ? 'good' : 'err'} role="status">{msg}</p>}
      {list.length === 0 ? <p className="adm-empty">Заборон немає.</p> : (
        <ul className="adm-list">{list.map(b => (
          <li key={b.user_id} className="adm-row">
            <div className="adm-row-main"><b>{b.who?.nick || b.who?.name || 'гравець'}</b><span className="muted">{new Date(b.at).toLocaleDateString('uk-UA')} · {b.reason}</span></div>
            <button type="button" className="btn ghost sm" onClick={() => unban(b.user_id)}>Зняти заборону</button>
          </li>))}
        </ul>
      )}
    </AdminSection>
  );
}
