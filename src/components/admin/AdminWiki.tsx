import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { dbError, field, FIELDS, REJECT_REASONS, SECTION_NAME, show, SOURCES, STATUS, validate, type Data, type Section } from '../../lib/wiki';
import { useAuth } from '../../lib/auth';
import FieldsEditor from '../wiki/FieldsEditor';
import { resetNames } from '../wiki/PageMeta';
import DiffView from '../wiki/DiffView';
import AdminSection from './AdminSection';
import { makeHash } from '../../lib/mapGeo';
import PointPreview from '../wiki/PointPreview';

/* «Довідник» (specs/043 US1/US3): одна черга пропозицій з усіх розділів; прийняти, прийняти з правками, відхилити з причиною.
   Рішення — лише функція бази wiki_decide (admin, moderator). Скрін-доказ після рішення видаляється (FR-024) */
interface Proposal {
  id: string; section: Section; target_id: string | null; kind: 'new' | 'edit' | 'hide'; data: Data; base_version: number | null;
  source: string; source_note: string; proof_path: string; author: string; status: string; reason: string; created_at: string;
  who: { name: string; nick: string | null } | null;
}
type Filter = 'all' | Section;
const KIND: Record<Proposal['kind'], string> = { new: 'нова сторінка', edit: 'правка', hide: 'прибрати сторінку' };
const kindOf = (p: { section: Section; kind: Proposal['kind'] }) => (p.section === 'map_point' ? (p.kind === 'new' ? 'нова мітка' : 'точка застаріла') : KIND[p.kind]);
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
  /* «Прийняти з правками»: null — публікуємо як запропонував автор */
  const [edit, setEdit] = useState<Data | null>(null);
  const [banReason, setBanReason] = useState(''); const [banOpen, setBanOpen] = useState(false);
  const [bansKey, setBansKey] = useState(0);
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
    setOpen(p); setCur(null); setProof(''); setEdit(null); setReason(''); setMsg(''); setNeedForce(p.status === 'conflict'); setBanOpen(false); setBanReason('');
    if (p.target_id) {
      const t = p.section === 'job' ? supabase!.from('jobs').select('*').eq('id', p.target_id)
        : p.section === 'map_point' ? supabase!.from('map_points').select('*').eq('id', Number(p.target_id))
        : supabase!.from('vehicles').select('*').eq('id', Number(p.target_id));
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
    const p_data: Data | null = action === 'accept' && edit !== null ? edit : null;
    if (p_data) { const first = Object.values(validate(open.section, p_data, open.kind === 'new'))[0]; if (first) { setMsg(first); return; } }
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

  /* заборона пропонувати (FR-013): пропозиції автора на розгляді лишаються — їх відхиляєш окремо */
  async function ban() {
    if (!open) return;
    if (!banReason.trim()) { setMsg('Напиши причину — її побачить гравець.'); return; }
    setBusy(true);
    const { error } = await supabase!.from('wiki_bans').upsert({ user_id: open.author, reason: banReason.trim().slice(0, 300) });
    setBusy(false);
    setMsg(error ? dbError(error) : 'Гравцю заборонено пропонувати правки. Зняти — у розділі «Заборони» нижче.');
    setBanOpen(false); setBansKey(k => k + 1);
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
          {(['all', 'job', 'vehicle', 'map_point'] as Filter[]).map(k => (
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
                  <b>{SECTION_NAME[p.section]} · {kindOf(p)}{p.kind === 'new' ? ': ' + String(p.data.name ?? '') : ''}</b>
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
        <AdminSection title={`${SECTION_NAME[open.section]} · ${kindOf(open)}${cur?.data.name ? ': ' + String(cur.data.name) : ''}`}
          hint={`Автор: ${open.who?.nick || open.who?.name || 'гравець'} · джерело: ${SOURCES.find(s => s[0] === open.source)?.[1]}${open.source_note ? ' — ' + open.source_note : ''}`}>
          {open.kind === 'hide' ? <p className="warn">{open.section === 'map_point'
              ? <>Гравець каже, що точка застаріла: «{open.source_note}». Мітку «{String(cur?.data.name ?? '')}» буде сховано з мапи — її можна повернути, історія лишається.</>
              : 'Сторінку буде сховано з публічних списків. Її можна повернути, історія лишається.'}</p>
            : open.kind === 'new' ? (
              <div className="wdiff"><dl>{FIELDS[open.section].filter(f => f.key in open.data).map(f => (
                <div key={f.key} className="wdiff-row"><dt>{f.label}</dt><dd><span className="wdiff-add">{show(field(open.section, f.key), open.data[f.key])}</span></dd></div>))}
                {'id' in open.data && <div className="wdiff-row"><dt>Адреса</dt><dd className="mono">{String(open.data.id)}</dd></div>}
                {open.section === 'map_point' && typeof open.data.x === 'number' && typeof open.data.y === 'number' && (
                  <div className="wdiff-row"><dt>На мапі</dt><dd><a href={'/mapa' + makeHash(open.data.x, open.data.y, 6)} target="_blank" rel="noopener noreferrer">Показати точку на мапі ↗</a></dd></div>)}
              </dl></div>
            ) : <DiffView section={open.section} old={data} changes={changes} stale={needForce || (cur !== null && open.base_version !== cur.version)} />}
          {open.section === 'map_point' && (() => {
            /* точка — з правок модератора, якщо він її підправив */
            const d = open.kind === 'hide' ? (cur?.data ?? {}) : edit ?? open.data;
            return typeof d.x === 'number' && typeof d.y === 'number' ? <PointPreview x={d.x} y={d.y} category={String(d.category_id ?? '')} /> : null;
          })()}
          {proof && <a href={proof} target="_blank" rel="noopener noreferrer"><img className="wproof" src={proof} alt="Скрін-доказ від автора" /></a>}
          {open.kind !== 'hide' && (edit === null
            ? <button type="button" className="btn ghost sm" onClick={() => setEdit({ ...open.data })}>Підправити перед публікацією</button>
            : <div className="wedit"><h3 className="wp-h">Твій варіант — його й буде опубліковано</h3>
                <FieldsEditor section={open.section} keys={Object.keys(open.data)} value={edit} onChange={setEdit} errors={validate(open.section, edit, open.kind === 'new')} />
                <button type="button" className="btn ghost sm" onClick={() => setEdit(null)}>Скасувати свої правки</button></div>)}
          <div className="fld"><span>Причина відхилення</span>
            <div className="row">{REJECT_REASONS.map(r => <button key={r} type="button" className={'btn ghost sm' + (reason === r ? ' on' : '')} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
            <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Або своя причина — її побачить автор" aria-label="Своя причина відхилення" />
          </div>
          <div className="row">
            {needForce
              ? <button type="button" className="btn acc" disabled={busy} onClick={() => decide('accept', true)}>Прийняти поверх нової версії</button>
              : <button type="button" className="btn acc" disabled={busy} onClick={() => decide('accept')}>{edit !== null && JSON.stringify(edit) !== JSON.stringify(open.data) ? 'Прийняти з правками' : 'Прийняти'}</button>}
            <button type="button" className="btn ghost" disabled={busy} onClick={() => decide('reject')}>Відхилити</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(null)}>Закрити</button>
            {!banOpen && <button type="button" className="btn ghost sm" onClick={() => setBanOpen(true)}>Заборонити автору пропонувати</button>}
          </div>
          {banOpen && (
            <div className="news-confirm">
              <p>Автор більше не зможе надсилати пропозиції й побачить причину. Зняти заборону можна будь-коли.</p>
              <input value={banReason} maxLength={300} onChange={e => setBanReason(e.target.value)} placeholder="Причина (наприклад: спам, вандалізм)" aria-label="Причина заборони" />
              <div className="row"><button type="button" className="btn acc sm" disabled={busy} onClick={ban}>Заборонити</button><button type="button" className="btn ghost sm" onClick={() => setBanOpen(false)}>Скасувати</button></div>
            </div>
          )}
          {msg && <p className="err" role="alert">{msg}</p>}
        </AdminSection>
      )}
      <Bans key={bansKey} />
      <Settings />
    </>
  );
}

/* заборонені автори (FR-013): зняти заборону */
type Ban = { user_id: string; reason: string; at: string; who: { name: string; nick: string | null } | null };
function Bans() {
  const [list, setList] = useState<Ban[] | null>(null);
  const [msg, setMsg] = useState('');
  const load = () => {
    supabase!.from('wiki_bans').select('user_id,reason,at,who:profiles!wiki_bans_user_id_fkey(name,nick)').order('at', { ascending: false })
      .then(({ data }) => setList((data ?? []) as unknown as Ban[]));
  };
  useEffect(load, []);
  async function unban(id: string) {
    const { error } = await supabase!.from('wiki_bans').delete().eq('user_id', id);
    setMsg(error ? dbError(error) : 'Заборону знято.'); load();
  }
  if (!list?.length) return msg ? <p className="good" role="status">{msg}</p> : null;
  return (
    <AdminSection title="Заборони" hint="Цим гравцям заборонено пропонувати правки довідника.">
      {msg && <p className={msg === 'Заборону знято.' ? 'good' : 'err'} role="status">{msg}</p>}
      <ul className="adm-list">{list.map(b => (
        <li key={b.user_id} className="adm-row">
          <div className="adm-row-main"><b>{b.who?.nick || b.who?.name || 'гравець'}</b><span className="muted">{new Date(b.at).toLocaleDateString('uk-UA')} · {b.reason}</span></div>
          <button type="button" className="btn ghost sm" onClick={() => unban(b.user_id)}>Зняти заборону</button>
        </li>))}
      </ul>
    </AdminSection>
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

