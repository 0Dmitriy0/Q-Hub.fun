import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { field, FIELDS, REJECT_REASONS, SECTION_NAME, show, SOURCES, validate, type Data, type Section } from '../../lib/wiki';
import { KIND_ONE, panelError, taskKind } from '../../lib/panel';
import FieldsEditor from '../wiki/FieldsEditor';
import { resetNames } from '../wiki/PageMeta';
import DiffView from '../wiki/DiffView';
import PointPreview from '../wiki/PointPreview';
import { makeHash } from '../../lib/mapGeo';

/* одна пропозиція довідника на одному екрані (specs/061 US2): що змінюється → автор → джерело й скрін → дії.
   Рішення — лише функція бази wiki_decide; скрін-доказ після рішення видаляється (specs/043 FR-024) */
export interface Proposal {
  id: string; section: Section; target_id: string | null; kind: 'new' | 'edit' | 'hide'; data: Data; base_version: number | null;
  source: string; source_note: string; proof_path: string; author: string; status: string; reason: string; created_at: string;
  who: { name: string; nick: string | null } | null;
}
export type Outcome = 'accepted' | 'rejected' | 'gone';
export const authorName = (p: Proposal) => p.who?.nick || p.who?.name || 'гравець';

export default function ProposalView({ p, onDecided, onBanned, onClose }: {
  p: Proposal; onDecided: (o: Outcome, msg?: string) => void; onBanned?: () => void; onClose: () => void;
}) {
  const [cur, setCur] = useState<{ data: Data; version: number } | null>(null);
  const [proof, setProof] = useState(''); const [proofBroken, setProofBroken] = useState(false);
  const [stats, setStats] = useState<{ ok: number; no: number } | null>(null);
  /* «Підправити й опублікувати»: null — публікуємо як запропонував автор */
  const [edit, setEdit] = useState<Data | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false); const [reason, setReason] = useState('');
  const [banOpen, setBanOpen] = useState(false); const [banReason, setBanReason] = useState('');
  const [msg, setMsg] = useState(''); const [good, setGood] = useState(false); const [busy, setBusy] = useState(false);
  const [needForce, setNeedForce] = useState(p.status === 'conflict');

  useEffect(() => {
    let live = true;
    setCur(null); setProof(''); setProofBroken(false); setStats(null); setEdit(null); setRejectOpen(false); setReason('');
    setBanOpen(false); setBanReason(''); setMsg(''); setNeedForce(p.status === 'conflict');
    (async () => {
      if (p.target_id) {
        const t = p.section === 'job' ? supabase!.from('jobs').select('*').eq('id', p.target_id)
          : p.section === 'map_point' ? supabase!.from('map_points').select('*').eq('id', Number(p.target_id))
          : supabase!.from('vehicles').select('*').eq('id', Number(p.target_id));
        const { data } = await t.maybeSingle();
        if (live && data) setCur({ data: data as Data, version: Number((data as Data).version ?? 1) });
      }
      if (p.proof_path) {
        const { data } = await supabase!.storage.from('wiki-proof').createSignedUrl(p.proof_path, 600);
        if (live) { if (data?.signedUrl) setProof(data.signedUrl); else setProofBroken(true); }
      }
    })();
    /* історія автора: скільки його пропозицій уже прийняли й відхилили */
    supabase!.from('wiki_proposals').select('status').eq('author', p.author).in('status', ['accepted', 'accepted_edited', 'rejected']).limit(1000)
      .then(({ data }) => {
        if (!live) return;
        const rows = (data ?? []) as { status: string }[];
        setStats({ ok: rows.filter(r => r.status !== 'rejected').length, no: rows.filter(r => r.status === 'rejected').length });
      });
    return () => { live = false; };
  }, [p.id]);

  async function fail(error: { code?: string; message?: string }) {
    if (error.code === 'QH013') { setNeedForce(true); setMsg(''); return; }
    if (error.code === 'QH012') {
      const { data } = await supabase!.from('wiki_proposals').select('decided_by').eq('id', p.id).maybeSingle();
      const by = (data as { decided_by: string | null } | null)?.decided_by;
      let nick: string | null = null;
      if (by) {
        const { data: pr } = await supabase!.from('profiles').select('name,nick').eq('id', by).maybeSingle();
        const x = pr as { name: string; nick: string | null } | null;
        nick = x?.nick || x?.name || null;
      }
      onDecided('gone', panelError(error, nick)); return;
    }
    setGood(false); setMsg(panelError(error));
  }

  async function decide(action: 'accept' | 'reject', force = false) {
    if (action === 'reject' && !reason.trim()) { setGood(false); setMsg('Вибери причину — її побачить автор.'); return; }
    const p_data: Data | null = action === 'accept' && edit !== null ? edit : null;
    if (p_data) { const first = Object.values(validate(p.section, p_data, p.kind === 'new'))[0]; if (first) { setGood(false); setMsg(first); return; } }
    setBusy(true); setMsg('');
    const { error } = await supabase!.rpc('wiki_decide', { p_id: p.id, p_action: action, p_data, p_reason: reason.trim(), p_force: force });
    if (error) { setBusy(false); await fail(error); return; }
    /* скрін більше не потрібен; якщо не вдалося — лишиться для прибирання старих скрінів */
    if (p.proof_path) await supabase!.storage.from('wiki-proof').remove([p.proof_path]);
    setBusy(false); resetNames();
    onDecided(action === 'accept' ? 'accepted' : 'rejected');
  }

  /* заборона пропонувати (specs/043 FR-013): пропозиції автора на розгляді лишаються — їх відхиляєш окремо */
  async function ban() {
    if (!banReason.trim()) { setGood(false); setMsg('Напиши причину — її побачить гравець.'); return; }
    setBusy(true);
    const { error } = await supabase!.from('wiki_bans').upsert({ user_id: p.author, reason: banReason.trim().slice(0, 300) });
    setBusy(false);
    if (error) { setGood(false); setMsg(panelError(error)); return; }
    setGood(true); setMsg('Гравцю заборонено пропонувати правки. Зняти — у «Прибраних і заборонах».');
    setBanOpen(false); onBanned?.();
  }

  const kind = taskKind(p);
  const data = p.kind === 'new' ? {} : cur?.data ?? {};
  const changes = useMemo(() => (p.kind === 'hide' ? {} : p.data), [p]);
  const title = `${SECTION_NAME[p.section]} · ${KIND_ONE[kind]}${cur?.data.name ? ': ' + String(cur.data.name) : p.kind === 'new' && p.data.name ? ': ' + String(p.data.name) : ''}`;
  const edited = edit !== null && JSON.stringify(edit) !== JSON.stringify(p.data);
  const point = p.section === 'map_point' ? (p.kind === 'hide' ? (cur?.data ?? {}) : edit ?? p.data) : null;

  return (
    <article className="pv" aria-labelledby="pv-t">
      <header className="pv-h">
        <button type="button" className="btn ghost sm pv-back" onClick={onClose}>← До черги</button>
        <h2 id="pv-t">{title}</h2>
      </header>

      <section className="pv-part" aria-label="Що змінюється">
        {needForce && <p className="warn">Поки ця правка чекала, картку вже змінили. Нижче — що зміниться поверх нової версії.</p>}
        {p.kind === 'hide' ? <p className="warn">{p.section === 'map_point'
            ? <>Гравець каже, що точка застаріла: «{p.source_note}». Мітку «{String(cur?.data.name ?? '')}» буде сховано з мапи — її можна повернути, історія лишається.</>
            : 'Сторінку буде сховано зі списків. Її можна повернути, історія лишається.'}</p>
          : p.kind === 'new' ? (
            <div className="wdiff"><dl>{FIELDS[p.section].filter(f => f.key in p.data).map(f => (
              <div key={f.key} className="wdiff-row"><dt>{f.label}</dt><dd><span className="wdiff-add">{show(field(p.section, f.key), p.data[f.key])}</span></dd></div>))}
              {'id' in p.data && <div className="wdiff-row"><dt>Адреса</dt><dd className="mono">{String(p.data.id)}</dd></div>}
              {p.section === 'map_point' && typeof p.data.x === 'number' && typeof p.data.y === 'number' && (
                <div className="wdiff-row"><dt>На мапі</dt><dd><a href={'/mapa' + makeHash(p.data.x, p.data.y, 6)} target="_blank" rel="noopener noreferrer">Показати точку на мапі ↗</a></dd></div>)}
            </dl></div>
          ) : <DiffView section={p.section} old={data} changes={changes} stale={needForce || (cur !== null && p.base_version !== cur.version)} />}
        {point && typeof point.x === 'number' && typeof point.y === 'number' && <PointPreview x={point.x} y={point.y} category={String(point.category_id ?? '')} />}
      </section>

      <section className="pv-part pv-who" aria-label="Хто запропонував">
        <b>{authorName(p)}</b>
        <span className="muted">{!stats ? '…' : stats.ok + stats.no === 0 ? 'Перша пропозиція цього гравця' : `Раніше прийнято: ${stats.ok} · відхилено: ${stats.no}`}</span>
        <span className="muted">Звідки знає: {SOURCES.find(s => s[0] === p.source)?.[1] ?? '—'}{p.source_note && p.kind !== 'hide' ? ' — ' + p.source_note : ''}</span>
        {p.proof_path && (proofBroken ? <span className="muted">Скрін уже прибрано.</span>
          : proof && <a href={proof} target="_blank" rel="noopener noreferrer"><img className="wproof" src={proof} alt="Скрін-доказ від автора" onError={() => setProofBroken(true)} /></a>)}
      </section>

      {p.kind !== 'hide' && edit !== null && (
        <section className="pv-part wedit" aria-label="Твій варіант">
          <h3 className="wp-h">Твій варіант — його й буде опубліковано</h3>
          <FieldsEditor section={p.section} keys={Object.keys(p.data)} value={edit} onChange={setEdit} errors={validate(p.section, edit, p.kind === 'new')} />
          <button type="button" className="btn ghost sm" onClick={() => setEdit(null)}>Скасувати свої правки</button>
        </section>
      )}

      {rejectOpen && (
        <div className="fld pv-part"><span>Чому відхиляєш — це побачить автор</span>
          <div className="row">{REJECT_REASONS.map(r => <button key={r} type="button" className={'btn ghost sm' + (reason === r ? ' on' : '')} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
          <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Або своя причина" aria-label="Своя причина відхилення" />
        </div>
      )}
      {banOpen && (
        <div className="news-confirm pv-part">
          <p>Автор більше не зможе надсилати пропозиції й побачить причину. Зняти заборону можна будь-коли.</p>
          <input value={banReason} maxLength={300} onChange={e => setBanReason(e.target.value)} placeholder="Причина (наприклад: спам, вандалізм)" aria-label="Причина заборони" />
          <div className="row"><button type="button" className="btn acc sm" disabled={busy} onClick={ban}>Заборонити</button><button type="button" className="btn ghost sm" onClick={() => setBanOpen(false)}>Скасувати</button></div>
        </div>
      )}
      {msg && <p className={good ? 'good' : 'err'} role={good ? 'status' : 'alert'}>{msg}</p>}

      <footer className="pv-act">
        {rejectOpen ? (<>
          <button type="button" className="btn acc" disabled={busy} onClick={() => decide('reject')}>Відхилити</button>
          <button type="button" className="btn ghost" onClick={() => { setRejectOpen(false); setReason(''); setMsg(''); }}>Скасувати</button>
        </>) : (<>
          {needForce
            ? <button type="button" className="btn acc" disabled={busy} onClick={() => decide('accept', true)}>Опублікувати поверх нової версії</button>
            : <button type="button" className="btn acc" disabled={busy} onClick={() => decide('accept')}>{edited ? 'Опублікувати з моїми правками' : 'Опублікувати'}</button>}
          {p.kind !== 'hide' && edit === null && <button type="button" className="btn ghost" onClick={() => setEdit({ ...p.data })}>Підправити й опублікувати</button>}
          <button type="button" className="btn ghost" onClick={() => { setRejectOpen(true); setMsg(''); }}>Відхилити</button>
          {!banOpen && <button type="button" className="btn ghost sm pv-ban" onClick={() => setBanOpen(true)}>Заборонити автору пропонувати</button>}
        </>)}
      </footer>
    </article>
  );
}
