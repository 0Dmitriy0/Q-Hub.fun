import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { money } from '../../lib/format';
import { adminError, when } from '../../lib/admin';
import AdminSection from './AdminSection';

/* Черги від програми (specs/039 US1): невідомі назви, ціни поза межами, непідтверджені ціни, чернетки міток.
   Кожна дія — одна функція бази, рядок черги видаляється першим: другий адмін побачить «уже розібрано» (FR-010) */
type Unknown = { id: number; buyer_id: string; text: string; seen_count: number; last_seen: string; buyers: { name: string } | null };
type Limit = { buyer_id: string; item_id: number; price: number; seen_count: number; last_seen: string; buyer_items: { min_price: number; max_price: number; items: { name: string } | null; buyers: { name: string } | null } | null };
type Pending = { buyer_id: string; item_id: number; item: string; price: number; votes: number; need: number; last_at: string; reporters: string[] };
type Counts = { unknown: number; limits: number; pending: number; drafts: number };
type Item = { id: number; name: string };
type Cat = { key: string; name: string };

export default function AdminQueues({ onChange }: { onChange: () => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const reload = () => { setTick(t => t + 1); onChange(); };
  useEffect(() => {
    setErr('');
    supabase!.rpc('admin_queue_counts').then(({ data, error }) => { if (error) setErr(adminError(error)); else setCounts(data as Counts); });
  }, [tick]);

  const empty = counts && !counts.unknown && !counts.limits && !counts.pending && !counts.drafts;
  return (
    <>
      <AdminSection title="Черги від програми" loading={!counts && !err} error={err} onRetry={reload}
        hint="Що програма побачила у вікнах скупників і чого сама не вирішує: товари, межі, ціни без другого підтвердження, чернетки міток.">
        {empty
          ? <p className="adm-empty">Черги порожні — нічого розбирати.</p>
          : counts && <div className="adm-counts">
            <span className="pill">Невідомі товари: <b>{counts.unknown}</b></span>
            <span className="pill">Поза межами: <b>{counts.limits}</b></span>
            <span className="pill">Без підтвердження: <b>{counts.pending}</b></span>
            <span className="pill">Чернетки міток: <b>{counts.drafts}</b></span>
          </div>}
      </AdminSection>
      {counts && !empty && <>
        {counts.unknown > 0 && <UnknownQueue key={'u' + tick} onDone={reload} />}
        {counts.limits > 0 && <LimitQueue key={'l' + tick} onDone={reload} />}
        {counts.pending > 0 && <PendingQueue key={'p' + tick} onDone={reload} />}
        {counts.drafts > 0 && (
          <AdminSection title={`Чернетки міток: ${counts.drafts}`} hint="Розбір — на мапі: там видно, де саме гравець поставив мітку.">
            <Link className="btn acc sm" to="/mapa?tools=drafts">Розібрати на мапі</Link>
          </AdminSection>
        )}
      </>}
    </>
  );
}

/* ---------- невідомі назви ---------- */
function UnknownQueue({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Unknown[] | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<{ id: number; mode: 'add' | 'alias' } | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const load = () => {
    setErr('');
    supabase!.from('buyer_unknown_items').select('id,buyer_id,text,seen_count,last_seen,buyers(name)')
      .order('seen_count', { ascending: false }).order('last_seen', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) setErr(adminError(error)); else setRows(data as unknown as Unknown[]); });
  };
  useEffect(load, []);

  async function act(r: Unknown, args: Record<string, unknown>) {
    const { error } = await supabase!.rpc('admin_unknown_resolve', { p_id: r.id, ...args });
    if (error) { setMsg(m => ({ ...m, [r.id]: adminError(error) })); if (error.code === 'P0002') onDone(); return; }
    setOpen(null); setRows(rs => rs!.filter(x => x.id !== r.id)); onDone();
  }
  return (
    <AdminSection title="Невідомі товари" loading={!rows && !err} error={err} onRetry={load}
      hint="Назва з вікна скупника, якої немає в Q-Hub. Частіші — вгорі. «Це вже є» — назва з помилкою розпізнавання: програма надалі знатиме її як цей товар.">
      <ul className="adm-list">
        {rows?.map(r => (
          <li key={r.id} className="adm-row">
            <div className="adm-row-main">
              <b>{r.text}</b>
              <span className="muted">{r.buyers?.name || r.buyer_id} · бачили {r.seen_count} {r.seen_count === 1 ? 'раз' : 'разів'} · {when(r.last_seen)}</span>
            </div>
            <div className="adm-row-act">
              <button type="button" className="btn acc sm" onClick={() => setOpen({ id: r.id, mode: 'add' })}>Додати товар</button>
              <button type="button" className="btn ghost sm" onClick={() => setOpen({ id: r.id, mode: 'alias' })}>Це вже є…</button>
              <button type="button" className="btn ghost sm" onClick={() => act(r, { p_action: 'drop' })}>Відкинути</button>
            </div>
            {open?.id === r.id && <UnknownForm r={r} mode={open.mode} onCancel={() => setOpen(null)} onSubmit={args => act(r, args)} />}
            {msg[r.id] && <p className="err" role="alert">{msg[r.id]}</p>}
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

function UnknownForm({ r, mode, onCancel, onSubmit }: { r: Unknown; mode: 'add' | 'alias'; onCancel: () => void; onSubmit: (a: Record<string, unknown>) => void }) {
  const [own, setOwn] = useState<(Item & { category: string })[] | null>(null);   // товари цього скупника
  const [all, setAll] = useState<Item[]>([]);                                     // увесь каталог — для «додати наявний»
  const [cats, setCats] = useState<Cat[]>([]);
  const [name, setName] = useState(r.text.trim());
  const [cat, setCat] = useState('');
  const [existing, setExisting] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase!.from('buyer_items').select('item_id,items(id,name,category)').eq('buyer_id', r.buyer_id).then(({ data }) => {
      const its = ((data || []) as unknown as { items: Item & { category: string } }[]).map(x => x.items).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
      setOwn(its);
      /* типова категорія — найчастіша серед товарів цього скупника */
      const freq: Record<string, number> = {};
      for (const i of its) freq[i.category] = (freq[i.category] || 0) + 1;
      setCat(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '');
    });
    if (mode === 'add') {
      supabase!.from('categories').select('key,name').order('sort').then(({ data }) => setCats((data || []) as Cat[]));
      supabase!.from('items').select('id,name').order('name').then(({ data }) => setAll((data || []) as Item[]));
    }
  }, [r.buyer_id, mode]);

  if (mode === 'alias') {
    const list = (own || []).filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()));
    return (
      <form className="adm-form" onSubmit={e => { e.preventDefault(); if (existing) onSubmit({ p_action: 'alias', p_item: Number(existing) }); }}>
        <label className="fld">Пошук товару скупника<input value={q} onChange={e => setQ(e.target.value)} placeholder="почни писати назву" autoFocus /></label>
        <label className="fld">«{r.text}» — це
          <select value={existing} onChange={e => setExisting(e.target.value)} required>
            <option value="">{own ? 'Обери товар' : 'Вантажу…'}</option>
            {list.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <div className="row"><button className="btn acc sm" disabled={!existing}>Запам'ятати як цей товар</button><button type="button" className="btn ghost sm" onClick={onCancel}>Скасувати</button></div>
      </form>
    );
  }
  const ownIds = new Set((own || []).map(i => i.id));
  return (
    <form className="adm-form" onSubmit={e => { e.preventDefault(); onSubmit(existing ? { p_action: 'add', p_item: Number(existing) } : { p_action: 'add', p_name: name, p_category: cat }); }}>
      <label className="fld">Наявний товар з каталогу (якщо цей скупник просто ще його не мав)
        <select value={existing} onChange={e => setExisting(e.target.value)}>
          <option value="">— новий товар —</option>
          {all.filter(i => !ownIds.has(i.id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </label>
      {!existing && <>
        <label className="fld">Назва нового товару<input value={name} onChange={e => setName(e.target.value)} maxLength={80} required autoFocus /></label>
        <label className="fld">Категорія
          <select value={cat} onChange={e => setCat(e.target.value)} required>
            <option value="">Обери категорію</option>
            {cats.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
        </label>
      </>}
      <p className="muted adm-note">Межі й ціну задаси на сторінці «Ціни»; до того програма бере ціну лише з підтвердженням.</p>
      <div className="row"><button className="btn acc sm">Додати до скупника</button><button type="button" className="btn ghost sm" onClick={onCancel}>Скасувати</button></div>
    </form>
  );
}

/* ---------- ціни поза межами ---------- */
function LimitQueue({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Limit[] | null>(null);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const load = () => {
    setErr('');
    supabase!.from('buyer_limit_reports').select('buyer_id,item_id,price,seen_count,last_seen,buyer_items(min_price,max_price,items(name),buyers(name))')
      .order('seen_count', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) setErr(adminError(error)); else setRows(data as unknown as Limit[]); });
  };
  useEffect(load, []);
  const key = (r: Limit) => r.buyer_id + ':' + r.item_id;
  async function act(r: Limit, args: Record<string, unknown>) {
    const { error } = await supabase!.rpc('admin_limit_resolve', { p_buyer: r.buyer_id, p_item: r.item_id, ...args });
    if (error) { setMsg(m => ({ ...m, [key(r)]: adminError(error) })); if (error.code === 'P0002') onDone(); return; }
    setEdit(null); setRows(rs => rs!.filter(x => key(x) !== key(r))); onDone();
  }
  return (
    <AdminSection title="Ціни поза межами" loading={!rows && !err} error={err} onRetry={load}
      hint="Програма тричі впевнено прочитала ціну, якої межі скупника не пускають. Якщо скупник справді змінив межі — поправ їх.">
      <ul className="adm-list">
        {rows?.map(r => {
          const bi = r.buyer_items;
          return (
            <li key={key(r)} className="adm-row">
              <div className="adm-row-main">
                <b>{bi?.items?.name || '#' + r.item_id} — {money(r.price)}</b>
                <span className="muted">{bi?.buyers?.name || r.buyer_id} · межі {money(bi?.min_price || 0)}–{money(bi?.max_price || 0)} · бачили {r.seen_count} · {when(r.last_seen)}</span>
              </div>
              <div className="adm-row-act">
                <button type="button" className="btn acc sm" onClick={() => setEdit(key(r))}>Поправити межі</button>
                <button type="button" className="btn ghost sm" onClick={() => act(r, { p_action: 'drop' })}>Відкинути</button>
              </div>
              {edit === key(r) && <LimitForm r={r} onCancel={() => setEdit(null)} onSubmit={(min, max) => act(r, { p_action: 'fix', p_min: min, p_max: max })} />}
              {msg[key(r)] && <p className="err" role="alert">{msg[key(r)]}</p>}
            </li>
          );
        })}
      </ul>
    </AdminSection>
  );
}

function LimitForm({ r, onCancel, onSubmit }: { r: Limit; onCancel: () => void; onSubmit: (min: number, max: number) => void }) {
  const cur = r.buyer_items;
  const [min, setMin] = useState(String(Math.min(cur?.min_price || r.price, r.price)));
  const [max, setMax] = useState(String(Math.max(cur?.max_price || r.price, r.price)));
  const lo = Number(min), hi = Number(max), bad = !(lo > 0 && hi > lo);
  return (
    <form className="adm-form adm-form-row" onSubmit={e => { e.preventDefault(); if (!bad) onSubmit(lo, hi); }}>
      <label className="fld">Мінімум, $<input inputMode="numeric" value={min} onChange={e => setMin(e.target.value.replace(/\D/g, ''))} autoFocus /></label>
      <label className="fld">Максимум, $<input inputMode="numeric" value={max} onChange={e => setMax(e.target.value.replace(/\D/g, ''))} /></label>
      <div className="row"><button className="btn acc sm" disabled={bad}>Зберегти межі</button><button type="button" className="btn ghost sm" onClick={onCancel}>Скасувати</button></div>
      {bad && <p className="err">Мінімум більший за 0 і менший за максимум.</p>}
    </form>
  );
}

/* ---------- непідтверджені ціни ---------- */
function PendingQueue({ onDone }: { onDone: () => void }) {
  const { session, current, characters } = useAuth();
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const load = () => {
    setErr('');
    supabase!.rpc('admin_price_pending').then(({ data, error }) => { if (error) setErr(adminError(error)); else setRows((data || []) as Pending[]); });
    supabase!.from('buyers').select('id,name').then(({ data }) => setNames(Object.fromEntries((data || []).map(b => [b.id, b.name]))));
  };
  useEffect(load, []);
  const key = (r: Pending) => `${r.buyer_id}:${r.item_id}:${r.price}`;
  const gone = (r: Pending) => { setRows(rs => rs!.filter(x => key(x) !== key(r))); onDone(); };

  /* «Підтвердити» — звичайне ручне внесення адміна з сайту: база одразу ставить його поточною (0043) */
  async function confirm(r: Pending) {
    const c = current || characters[0];
    if (!c) { setMsg(m => ({ ...m, [key(r)]: 'Щоб внести ціну, потрібен персонаж зі статіком — додай його в програмі.' })); return; }
    const { error } = await supabase!.from('price_reports').insert({ kind: 'buyer', buyer_id: r.buyer_id, item_id: r.item_id, price: r.price, character_id: c.id, reporter: session?.user.id });
    if (error) { setMsg(m => ({ ...m, [key(r)]: error.code === 'P0001' ? error.message : adminError(error) })); return; }
    gone(r);
  }
  async function reject(r: Pending) {
    const { error } = await supabase!.rpc('admin_price_reject', { p_buyer: r.buyer_id, p_item: r.item_id, p_price: r.price });
    if (error) { setMsg(m => ({ ...m, [key(r)]: adminError(error) })); if (error.code === 'P0002') onDone(); return; }
    gone(r);
  }
  return (
    <AdminSection title="Ціни без підтвердження" loading={!rows && !err} error={err} onRetry={load}
      hint="Нова ціна, яку поки вніс лише один акаунт. «Підтвердити» — внести її від себе (стає поточною одразу); «Відкинути» — прибрати голоси за неї.">
      {rows && !rows.length ? <p className="adm-empty">Усі ціни підтверджені.</p> : (
        <ul className="adm-list">
          {rows?.map(r => (
            <li key={key(r)} className="adm-row">
              <div className="adm-row-main">
                <b>{r.item} — {money(r.price)}</b>
                <span className="muted">{names[r.buyer_id] || r.buyer_id} · {r.votes} з {r.need} · {r.reporters.join(', ')} · {when(r.last_at)}</span>
              </div>
              <div className="adm-row-act">
                <button type="button" className="btn acc sm" onClick={() => confirm(r)}>Підтвердити</button>
                <button type="button" className="btn ghost sm" onClick={() => reject(r)}>Відкинути</button>
              </div>
              {msg[key(r)] && <p className="err" role="alert">{msg[key(r)]}</p>}
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}
