import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { dbError, field, FIELDS, REJECT_REASONS, SECTION_NAME, show, SOURCES, STATUS, type Data, type Section } from '../../lib/wiki';
import { resetNames } from '../wiki/PageMeta';
import DiffView from '../wiki/DiffView';
import AdminSection from './AdminSection';

/* «Довідник» (specs/043 US1/US3): одна черга пропозицій з усіх розділів; прийняти, прийняти з правками, відхилити з причиною.
   Рішення — лише функція бази wiki_decide (admin, moderator). Скрін-доказ після рішення видаляється (FR-024) */
interface Proposal {
  id: string; section: Section; target_id: string | null; kind: 'new' | 'edit' | 'hide'; data: Data; base_version: number | null;
  source: string; source_note: string; proof_path: string; author: string; status: string; reason: string; created_at: string;
  who: { name: string; nick: string | null } | null;
}
type Filter = 'all' | Section;
const KIND: Record<Proposal['kind'], string> = { new: 'нова сторінка', edit: 'правка', hide: 'прибрати сторінку' };
const age = (s: string) => {
  const h = Math.floor((Date.now() - new Date(s).getTime()) / 3_600_000);
  return h < 1 ? 'щойно' : h < 24 ? `${h} год тому` : `${Math.floor(h / 24)} дн тому`;
};

export default function AdminWiki() {
  const [list, setList] = useState<Proposal[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Proposal | null>(null);
  const [cur, setCur] = useState<{ data: Data; version: number } | null>(null);
  const [proof, setProof] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [needForce, setNeedForce] = useState(false);

  async function load() {
    setErr('');
    const { data, error } = await supabase!.from('wiki_proposals')
      .select('*, who:profiles!wiki_proposals_author_fkey(name,nick)').in('status', ['pending', 'conflict']).order('created_at').limit(300);
    if (error) { setErr('Не вдалося завантажити чергу — міграцію 0057_community_wiki.sql застосовано?'); return; }
    setList(data as unknown as Proposal[]);
  }
  useEffect(() => { load(); }, []);

  async function openOne(p: Proposal) {
    setOpen(p); setCur(null); setProof(''); setEdit(null); setReason(''); setMsg(''); setNeedForce(p.status === 'conflict');
    if (p.target_id) {
      const t = p.section === 'job' ? supabase!.from('jobs').select('*').eq('id', p.target_id) : supabase!.from('vehicles').select('*').eq('id', Number(p.target_id));
      const { data } = await t.maybeSingle();
      if (data) setCur({ data: data as Data, version: Number((data as Data).version ?? 1) });
    }
    if (p.proof_path) {
      const { data } = await supabase!.storage.from('wiki-proof').createSignedUrl(p.proof_path, 600);
      setProof(data?.signedUrl ?? '');
    }
  }

  async function decide(action: 'accept' | 'reject', force = false) {
    if (!open) return;
    if (action === 'reject' && !reason.trim()) { setMsg('Вибери або напиши причину відхилення.'); return; }
    let p_data: Data | null = null;
    if (action === 'accept' && edit !== null) {
      try { p_data = JSON.parse(edit) as Data; } catch { setMsg('Правки модератора — некоректний JSON.'); return; }
    }
    setBusy(true); setMsg('');
    const { error } = await supabase!.rpc('wiki_decide', { p_id: open.id, p_action: action, p_data, p_reason: reason.trim(), p_force: force });
    if (error) {
      setBusy(false);
      if (error.code === 'QH013') setNeedForce(true);
      setMsg(dbError(error)); return;
    }
    /* скрін більше не потрібен — видаляємо одразу (FR-024); якщо не вдалося, лишиться для кнопки «Прибрати старі скріни» */
    if (open.proof_path) {
      await supabase!.storage.from('wiki-proof').remove([open.proof_path]);
    }
    setBusy(false); resetNames();
    setMsg(action === 'accept' ? 'Прийнято — картку оновлено.' : 'Відхилено — автор побачить причину в кабінеті.');
    setOpen(null); load();
  }

  const shown = (list ?? []).filter(p => filter === 'all' || p.section === filter);
  const oldest = list?.length ? list[0].created_at : null;
  const data = open?.kind === 'new' ? {} : cur?.data ?? {};
  const changes = useMemo(() => (open ? (open.kind === 'hide' ? {} : open.data) : {}), [open]);

  return (
    <>
      <AdminSection title="Пропозиції довідника" error={err} onRetry={load} loading={!list && !err}
        hint={list ? `Чекають: ${list.length}${oldest ? ` · найстаріша — ${age(oldest)}` : ''}. Без рішення модератора картки не змінюються.` : undefined}
        actions={<div className="seg" role="tablist" aria-label="Розділ">
          {(['all', 'job', 'vehicle'] as Filter[]).map(k => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
              {k === 'all' ? 'Усі' : SECTION_NAME[k]} · {(list ?? []).filter(p => k === 'all' || p.section === k).length}
            </button>))}
        </div>}>
        {msg && !open && <p className={/^(Прийнято|Відхилено)/.test(msg) ? 'good' : 'err'} role="status">{msg}</p>}
        {shown.length === 0 ? <p className="adm-empty">Черга порожня — усе розглянуто.</p> : (
          <ul className="adm-list">
            {shown.map(p => (
              <li key={p.id} className={'adm-row' + (open?.id === p.id ? ' news-open' : '')}>
                <div className="adm-row-main">
                  <b>{SECTION_NAME[p.section]} · {KIND[p.kind]}{p.kind === 'new' ? ': ' + String(p.data.name ?? '') : ''}</b>
                  <span className="muted">{p.who?.nick || p.who?.name || 'гравець'} · {age(p.created_at)} · {SOURCES.find(s => s[0] === p.source)?.[1]}{p.proof_path ? ' · є скрін' : ''}</span>
                </div>
                {p.status === 'conflict' && <span className="pill warn">{STATUS.conflict[0]}</span>}
                <button type="button" className="btn ghost sm" onClick={() => openOne(p)}>{open?.id === p.id ? 'Відкрито' : 'Розглянути'}</button>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {open && (
        <AdminSection title={`${SECTION_NAME[open.section]} · ${KIND[open.kind]}${cur?.data.name ? ': ' + String(cur.data.name) : ''}`}
          hint={`Автор: ${open.who?.nick || open.who?.name || 'гравець'} · джерело: ${SOURCES.find(s => s[0] === open.source)?.[1]}${open.source_note ? ' — ' + open.source_note : ''}`}>
          {open.kind === 'hide' ? <p className="warn">Сторінку буде сховано з публічних списків. Її можна повернути, історія лишається.</p>
            : open.kind === 'new' ? (
              <div className="wdiff"><dl>{FIELDS[open.section].filter(f => f.key in open.data).map(f => (
                <div key={f.key} className="wdiff-row"><dt>{f.label}</dt><dd><span className="wdiff-add">{show(field(open.section, f.key), open.data[f.key])}</span></dd></div>))}
                {'id' in open.data && <div className="wdiff-row"><dt>Адреса</dt><dd className="mono">{String(open.data.id)}</dd></div>}
              </dl></div>
            ) : <DiffView section={open.section} old={data} changes={changes} stale={needForce || (cur !== null && open.base_version !== cur.version)} />}
          {proof && <a href={proof} target="_blank" rel="noopener noreferrer"><img className="wproof" src={proof} alt="Скрін-доказ від автора" /></a>}
          {open.kind !== 'hide' && (
            <details onToggle={e => { if ((e.target as HTMLDetailsElement).open && edit === null) setEdit(JSON.stringify(open.data, null, 2)); }}>
              <summary>Прийняти з власними правками</summary>
              <label className="fld">Поля, які буде опубліковано (JSON — ті самі ключі)
                <textarea className="mono" rows={10} value={edit ?? ''} onChange={e => setEdit(e.target.value)} /></label>
            </details>
          )}
          <div className="fld"><span>Причина відхилення</span>
            <div className="row">{REJECT_REASONS.map(r => <button key={r} type="button" className={'btn ghost sm' + (reason === r ? ' on' : '')} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
            <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Або своя причина — її побачить автор" aria-label="Своя причина відхилення" />
          </div>
          <div className="row">
            {needForce
              ? <button type="button" className="btn acc" disabled={busy} onClick={() => decide('accept', true)}>Прийняти поверх нової версії</button>
              : <button type="button" className="btn acc" disabled={busy} onClick={() => decide('accept')}>{edit !== null && edit !== JSON.stringify(open.data, null, 2) ? 'Прийняти з правками' : 'Прийняти'}</button>}
            <button type="button" className="btn ghost" disabled={busy} onClick={() => decide('reject')}>Відхилити</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(null)}>Закрити</button>
          </div>
          {msg && <p className="err" role="alert">{msg}</p>}
        </AdminSection>
      )}
    </>
  );
}
