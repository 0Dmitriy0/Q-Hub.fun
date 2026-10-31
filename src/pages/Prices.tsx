import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCharacterPick } from '../components/CharacterPick';
import { money, parseMoney, when } from '../lib/format';
import { GOOD, STALE, priceRange, rangePos, series, type Pt } from '../lib/pricestats';
import { dur } from '../lib/events';
import { PriceChart, RangeBar, Spark } from '../components/PriceChart';
import Icon from '../components/Icon';
import ShotImport from '../components/ShotImport';
import PicUpload from '../components/PicUpload';
import Leaderboard, { type Contributor } from '../components/Leaderboard';
import { groupUpdates, who, type Update } from '../lib/updates';
import { readCache, readSnapshot, writeCache, type PriceData } from '../lib/priceCache';
import { subRank, subRanks } from '../lib/subOrder';

interface Buyer { id: string; name: string; updated_at: string | null; image_url: string }
interface NextChange { buyer_id: string; next_change_at: string | null; nick: string | null }
/* sub — підгрупа («Шкури» / «М'ясо»); у старому кеші й знімку її немає (specs/028) */
interface Item { id: number; name: string; unit: string; image_url: string; sub?: string }
interface Row { buyer_id: string; item_id: number; min_price: number; max_price: number; price: number; price_at: string | null; items: Item | null }
interface Unknown { id: number; buyer_id: string; text: string; seen_count: number; last_seen: string }
/* «перевір межі» (specs/024, T031): ціна поза межами, яку програма впевнено прочитала тричі; на сайт вона не пішла */
interface LimitReport { buyer_id: string; item_id: number; price: number; seen_count: number; last_seen: string }
/* «без меж» — як у програмі (desktop/src/pricescan.cjs, inLimits): без них ціна з одного кадру не приймається */
const noLim = (r: Pick<Row, 'min_price' | 'max_price'>) => !(r.min_price > 0 && r.max_price > r.min_price);

type Data = PriceData<Buyer, Row, Update, Contributor, NextChange>;

interface Hist { buyer_id: string; item_id: number; price: number; at: string }

const DAY = 864e5;
/* історію тягнемо за рік із запасом: остання ціна до вікна графіка стає початком лінії */
const HIST_DAYS = 400;
const ms = (ts: string | null) => (ts ? new Date(ts).getTime() : 0);

function Pic({ url, alt, size = 40 }: { url: string; alt: string; size?: number }) {
  return url
    ? <img className="pic" src={url} alt={alt} width={size} height={size} loading="lazy" />
    : <span className="pic none" style={{ width: size, height: size }} aria-hidden="true">{alt.slice(0, 1)}</span>;
}

export default function Prices() {
  const { isStaff, role, session, signIn } = useAuth();
  const { pick: pickCharacter, dialog: pickDialog } = useCharacterPick();
  const isAdmin = role === 'admin';
  /* останні ціни з цього браузера видно одразу, без очікування бази */
  const [cached] = useState(() => readCache<Data>());
  const [buyers, setBuyers] = useState<Buyer[]>(cached?.buyers || []);
  const [rows, setRows] = useState<Row[]>(cached?.rows || []);
  const [ups, setUps] = useState<Update[]>(cached?.ups || []);
  const [top, setTop] = useState<Contributor[]>(cached?.top || []);
  const [saving, setSaving] = useState('');
  const [next, setNext] = useState<NextChange[]>(cached?.next || []);
  /* «через скільки» зміна цін: години й хвилини, як показує гра; null — форма закрита */
  const [nextEdit, setNextEdit] = useState<{ h: string; m: string } | null>(null);
  const [nextErr, setNextErr] = useState('');
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 30000); return () => clearInterval(id); }, []);
  const [tab, setTab] = useState(cached?.buyers[0]?.id || '');
  const [q, setQ] = useState('');
  /* сортування списку: за назвою (як було), за ціною, за свіжістю або за вигідністю (положення між мін і макс) */
  const [sort, setSort] = useState<'name' | 'price' | 'fresh' | 'good'>('name');
  /* калькулятор: товар (ключ buyer:item) і кількість */
  const [calc, setCalc] = useState({ key: '', qty: '10' });
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  /* звідки зараз ціни: жива база, збережені в браузері чи знімок сайту */
  const [from, setFrom] = useState<'live' | 'saved' | ''>(cached ? 'saved' : '');
  const [savedAt, setSavedAt] = useState(cached?.at || '');
  const gotLive = useRef(false);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<Record<string, Pt[]>>({});
  const [histFor, setHistFor] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState('');
  const [lim, setLim] = useState({ min: '', max: '' });
  /* адмін (specs/024): товари без меж — програма бере їхню ціну лише з двох зчиток; невідомі назви з вікон скупників */
  const [noLimOnly, setNoLimOnly] = useState(false);
  const [unknown, setUnknown] = useState<Unknown[]>([]);
  const [limRep, setLimRep] = useState<LimitReport[]>([]);
  const now = useMemo(() => Date.now(), [hist]);
  async function loadUnknown() {
    if (!supabase || !isAdmin) return;
    const { data } = await supabase.from('buyer_unknown_items').select('id,buyer_id,text,seen_count,last_seen').order('last_seen', { ascending: false });
    setUnknown((data as Unknown[]) || []);
    const lr = await supabase.from('buyer_limit_reports').select('buyer_id,item_id,price,seen_count,last_seen').order('last_seen', { ascending: false });
    setLimRep((lr.data as LimitReport[]) || []);
  }
  useEffect(() => { loadUnknown(); }, [isAdmin]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function dropUnknown(id: number) {
    const { error } = await supabase!.from('buyer_unknown_items').delete().eq('id', id);
    if (!error) setUnknown(u => u.filter(x => x.id !== id));
  }
  async function dropLimRep(l: LimitReport) {
    const { error } = await supabase!.from('buyer_limit_reports').delete().eq('buyer_id', l.buyer_id).eq('item_id', l.item_id);
    if (!error) setLimRep(x => x.filter(y => y !== l));
  }
  /* підказка зникає сама, коли адмін виправив межі так, що прочитана ціна в них */
  const limFor = (r: Pick<Row, 'buyer_id' | 'item_id' | 'min_price' | 'max_price'>) =>
    limRep.find(l => l.buyer_id === r.buyer_id && l.item_id === r.item_id && !noLim(r) && (l.price < r.min_price || l.price > r.max_price));

  async function load() {
    if (!supabase) return;
    const [b, r, u, c, n] = await Promise.all([
      supabase.from('buyers').select('id,name,updated_at,image_url').order('sort'),
      supabase.from('buyer_items').select('buyer_id,item_id,min_price,max_price,price,price_at,items(id,name,unit,image_url,sub)'),
      supabase.from('price_updates').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('contributors').select('*').order('total', { ascending: false }).limit(500),
      supabase.from('buyer_next_change').select('*')
    ]);
    setLoaded(true);
    if (b.error || r.error) { setErr('Не вдалося завантажити ціни. Перевір інтернет і онови сторінку.'); return; }
    /* хто оновлював і рейтинг — доповнення: без них ціни все одно показуються */
    show({ at: new Date().toISOString(), buyers: b.data as Buyer[], rows: r.data as unknown as Row[],
      ups: u.error ? [] : (u.data as Update[]), top: c.error ? [] : (c.data as Contributor[]), next: n.error ? [] : (n.data as NextChange[]) }, 'live');
  }
  function show(d: Data, src: 'live' | 'saved') {
    if (src === 'live') setErr(''); setBuyers(d.buyers); setRows(d.rows); setUps(d.ups || []); setTop(d.top || []); setNext(d.next || []);
    setFrom(src); setSavedAt(d.at);
    if (d.buyers.length) setTab(t => t || d.buyers[0].id);
    if (src === 'live') { gotLive.current = true; writeCache(d); }
  }
  useEffect(() => {
    load().catch(() => { setLoaded(true); setErr('Не вдалося завантажити ціни. Перевір інтернет і онови сторінку.'); });
    /* знімок сайту — для першого відкриття; новіших збережених чи живих цін він не перекриває */
    readSnapshot<Data>().then(s => { if (s && !gotLive.current && s.at > (cached?.at || '')) show(s, 'saved'); });
  }, []);

  async function loadHist(ids: string[]) {
    if (!supabase || !ids.length) return;
    setHistFor(s => new Set([...s, ...ids]));
    const { data, error } = await supabase.from('price_history').select('buyer_id,item_id,price,at')
      .in('buyer_id', ids).gte('at', new Date(Date.now() - HIST_DAYS * DAY).toISOString()).order('at').limit(5000);
    if (error) return; /* графік — доповнення: без історії сторінка цін працює як раніше */
    setHist(h => {
      const n = { ...h };
      for (const id of ids) for (const k of Object.keys(n)) if (k.startsWith(id + ':')) delete n[k];
      for (const r of data as Hist[]) (n[r.buyer_id + ':' + r.item_id] ||= []).push({ t: new Date(r.at).getTime(), p: Number(r.price) });
      return n;
    });
  }

  /* ранги підгруп кожного скупника — з усіх його товарів, а не з відфільтрованих: «лише без меж» не робить м'ясо основним */
  const ranks = useMemo(() => {
    const by = new Map<string, string[]>();
    for (const r of rows) if (r.items) (by.get(r.buyer_id) ?? by.set(r.buyer_id, []).get(r.buyer_id)!).push(r.items.sub || '');
    return new Map([...by].map(([id, subs]) => [id, subRanks(buyers.find(b => b.id === id)?.name || '', subs)]));
  }, [rows, buyers]);
  const rk = (r: Row) => subRank(ranks.get(r.buyer_id), r.items?.sub);
  const cur = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter(r => r.items && (ql ? r.items.name.toLowerCase().includes(ql) : r.buyer_id === tab) && (!noLimOnly || noLim(r)))
      .map(r => {
        /* автор поточної ціни — останнє внесення гравця, якщо воно і є цією ціною; інакше ціна з імпорту */
        const u = ups.find(x => x.buyer_id === r.buyer_id && x.item_id === r.item_id);
        const mine = u && Math.abs(ms(u.created_at) - ms(r.price_at)) < 2000;
        return { ...r, shown: r.price, at: r.price_at, by: mine ? who(u!) : r.price_at ? 'редактор' : '' };
      })
      .sort((a, b) => {
        const byName = a.items!.name.localeCompare(b.items!.name, 'uk');
        if (sort === 'price') return (b.shown || 0) - (a.shown || 0) || byName;
        if (sort === 'fresh') return ms(b.at) - ms(a.at) || byName;
        if (sort === 'good') {
          const p = (r: Row) => rangePos(r.price, priceRange(hist[r.buyer_id + ':' + r.item_id] || [], r.min_price, r.max_price, now)) ?? -1;
          return p(b) - p(a) || byName;
        }
        /* за назвою — блоками підгруп: шкури, потім м'ясо (specs/028) */
        return rk(a) - rk(b) || byName;
      });
  }, [rows, ups, tab, q, sort, hist, now, noLimOnly, ranks]);
  const buyer = buyers.find(b => b.id === tab);
  useEffect(() => { loadHist([...new Set(cur.map(r => r.buyer_id))].filter(id => !histFor.has(id))); }, [cur]);
  const reload = (buyerId: string) => { load(); loadHist([buyerId]); };

  function toggle(key: string, r: Row) {
    setOpen(o => (o === key ? '' : key));
    setLim({ min: r.min_price ? String(r.min_price) : '', max: r.max_price ? String(r.max_price) : '' });
  }
  async function saveLimits(r: Row) {
    const min = parseMoney(lim.min), max = parseMoney(lim.max);
    if ((min || max) && !(min > 0 && max > min)) { alert('Мінімум має бути більшим за нуль, а максимум — більшим за мінімум. Щоб прибрати межі, зітри обидва числа.'); return; }
    const { error } = await supabase!.from('buyer_items').update({ min_price: min, max_price: max }).eq('buyer_id', r.buyer_id).eq('item_id', r.item_id);
    if (error) { alert('Не вдалося зберегти межі.'); return; }
    load();
  }

  /* і гравці, і редактори вносять ціну однаково — так кожне оновлення має автора і йде в рейтинг.
     Межі й «раз за цикл» перевіряє база; її пояснення показуємо як є */
  const [msg, setMsg] = useState<Record<string, string>>({});
  async function savePrice(r: Row) {
    const key = r.buyer_id + ':' + r.item_id, v = parseMoney(edit[key] ?? '');
    if (!(v > 0)) { setMsg(m => ({ ...m, [key]: 'Впиши ціну числом, наприклад 450 або 1,5к.' })); return; }
    /* з якого персонажа (specs/025): 2–3 — питаємо, 1 — сам; скасував — нічого не записано */
    const c = await pickCharacter();
    if (!c) return;
    if ('error' in c) { setMsg(m => ({ ...m, [key]: c.error })); return; }
    setSaving(key);
    const { error } = await supabase!.from('price_reports').insert({ kind: 'buyer', buyer_id: r.buyer_id, item_id: r.item_id, price: v, character_id: c.id });
    setSaving('');
    /* відмови бази (межі, ліміт, нік, персонаж) написані для гравця — показуємо як є */
    if (error) { setMsg(m => ({ ...m, [key]: error.code === 'P0001' ? error.message : 'Не вдалося зберегти ціну. Спробуй ще раз.' })); return; }
    setEdit(e => { const n = { ...e }; delete n[key]; return n; });
    setMsg(m => { const n = { ...m }; delete n[key]; return n; });
    reload(r.buyer_id);
  }
  const cs = tick - STALE;
  const fresh = cur.filter(r => ms(r.at) >= cs).length;
  const lastAt = cur.reduce((m, r) => Math.max(m, ms(r.at)), 0);
  /* час наступної зміни цін, який вписав гравець; після нього три години показуємо «мала бути» */
  const nx = next.find(x => x.buyer_id === tab), nxAt = ms(nx?.next_change_at ?? null);
  const nxState = !nxAt ? 'none' : nxAt > tick ? 'soon' : tick - nxAt < STALE ? 'passed' : 'none';
  async function saveNext() {
    const h = Number(nextEdit?.h || 0), m = Number(nextEdit?.m || 0), mins = h * 60 + m;
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59 || mins < 1 || mins > 24 * 60) { setNextErr('Вкажи, через скільки зміна: від 1 хв до 24 год, наприклад 1 год 25 хв.'); return; }
    const at = Date.now() + mins * 60000;
    const { error } = await supabase!.rpc('set_next_change', { p_buyer: tab, p_at: new Date(at).toISOString() });
    if (error) { setNextErr(/^(Спершу|Час|Немає)/.test(error.message) ? error.message : 'Не вдалося зберегти час. Спробуй ще раз.'); return; }
    setNextEdit(null); setNextErr(''); load();
  }
  const [allUps, setAllUps] = useState(false);
  const groups = useMemo(() => groupUpdates(ups), [ups]);
  /* видно лише два останні оновлення, решта — під кнопкою */
  const SHOWN = 2;
  const recent = groups.slice(0, allUps ? 30 : SHOWN);
  const buyerSize = (id: string) => rows.filter(r => r.buyer_id === id).length;
  const buyerName = (id: string) => buyers.find(b => b.id === id)?.name || '';
  const itemName = (id: number) => rows.find(r => r.item_id === id)?.items?.name || '—';
  /* «вигідно здавати зараз»: свіжі ціни (до 3 год), найближчі до максимуму скупника за межами з гри */
  const leaders = useMemo(() => rows
    .filter(r => r.items && r.price > 0 && ms(r.price_at) >= cs)
    .map(r => ({ r, pos: rangePos(r.price, priceRange([], r.min_price, r.max_price)) }))
    .filter((x): x is { r: Row; pos: number } => x.pos !== null)
    .sort((a, b) => b.pos - a.pos || b.r.price - a.r.price).slice(0, 3), [rows, cs]);
  const freshAll = rows.filter(r => ms(r.price_at) >= cs).length;
  const lastAll = rows.reduce((m, r) => Math.max(m, ms(r.price_at)), 0);
  const priced = useMemo(() => rows.filter(r => r.items && r.price > 0).sort((a, b) => a.items!.name.localeCompare(b.items!.name, 'uk')), [rows]);
  const calcRow = priced.find(r => r.buyer_id + ':' + r.item_id === calc.key) || priced[0];
  const calcQty = Math.max(0, Math.floor(Number(calc.qty.replace(/s/g, '')) || 0));
  const pick = (id: string) => { setQ(''); setTab(id); document.getElementById('price-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="bp">
      {pickDialog}
      {/* смужка стану ринку — лише справжні числа з бази */}
      {buyers.length > 0 && <div className="bp-status">
        <span><span className="mdot good" aria-hidden="true" />Скупників: <b className="mono">{buyers.length}</b></span>
        <span>Товарів: <b className="mono">{rows.length}</b></span>
        <span>Свіжих цін (до 3 год): <b className="mono">{freshAll}</b></span>
        <span className="bp-status-r">Остання ціна: <b className="mono">{lastAll ? when(lastAll) : '—'}</b></span>
      </div>}

      <section className="bp-head">
        <div>
          <span className="h-kicker"><Icon name="buyer" size={16} />Ціни скупників</span>
          <h1>Ціни скупників Quant RP</h1>
          <p className="muted">Скупники міняють ціни в різний час. Побачив нову ціну в грі — онови її тут: вона одразу стане поточною, а ти отримаєш бал у рейтингу. Смужка показує, де ціна зараз між мінімумом і максимумом скупника: від {GOOD}% — вигідно здавати. Натисни на товар, щоб побачити графік.</p>
        </div>
        <div className="row">
          {session ? <a className="btn acc" href="#add-price"><Icon name="camera" />Внести ціни</a> : <button className="btn acc" onClick={signIn}><Icon name="user" />Увійти, щоб вносити ціни</button>}
          <Link className="btn ghost" to="/mapa"><Icon name="map" />Скупники на мапі</Link>
        </div>
      </section>

      {!supabase && <div className="card empty">База ще не підключена.</div>}
      {err && !buyers.length && <div className="card err">{err}</div>}
      {supabase && !loaded && !buyers.length && <div className="card empty" role="status">Завантажуємо ціни…</div>}
      {from === 'saved' && err && <p className="muted" role="status">Показуємо ціни станом на {when(ms(savedAt))} — свіжі завантажаться, щойно з'явиться зв'язок.</p>}
      {loaded && !err && !buyers.length && <div className="card empty">Скупників поки немає — скоро з'являться.</div>}
      {buyers.length > 0 && (
        <>
          {/* вигідно здавати зараз */}
          {leaders.length > 0 && <section className="h-sec">
            <div className="row between"><h2 className="ih"><Icon name="bolt" />Вигідно здавати зараз</h2><span className="h-lbl">свіжа ціна найближче до максимуму скупника</span></div>
            <div className="bp-leaders">{leaders.map(({ r, pos }, i) => (
              <button type="button" key={r.buyer_id + ':' + r.item_id} className="bp-lead" onClick={() => pick(r.buyer_id)}>
                <span className="bp-lead-h"><Pic url={r.items!.image_url} alt={r.items!.name} size={36} /><span><b>{r.items!.name}</b><small>{buyerName(r.buyer_id)}</small></span>{i === 0 && <span className="bp-tag">Топ</span>}</span>
                <span className="bp-lead-p"><b className="mono">{money(r.price)}</b><small>за {r.items!.unit}</small><span className="bp-pos mono">▲ {pos}%</span></span>
                <span className="bp-lead-f"><span>Межі: <b className="mono">{money(r.min_price)} – {money(r.max_price)}</b></span><span>{when(r.price_at!)}</span></span>
              </button>))}
            </div>
          </section>}

          {/* список цін */}
          <section className="card bp-list" id="price-list">
            <div className="bp-tools">
              <div className="fld has-ico bp-search"><Icon name="search" /><input type="search" placeholder="Пошук товару серед усіх скупників" value={q} onChange={e => setQ(e.target.value)} aria-label="Пошук товару" /></div>
              <label className="fld bp-sort"><span className="vh">Сортування</span>
                <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Сортування">
                  <option value="name">За назвою</option><option value="good">Найвигідніші зараз</option><option value="price">Найдорожчі</option><option value="fresh">Нещодавно оновлені</option>
                </select>
              </label>
            </div>
            {!q && <div className="tabs bp-tabs" role="tablist">{buyers.map(b => (
              <a key={b.id} href={'#' + b.id} role="tab" aria-selected={b.id === tab} className={'tabpic' + (b.id === tab ? ' active' : '')} onClick={e => { e.preventDefault(); setTab(b.id); }}>
                <Pic url={b.image_url} alt={b.name} size={24} />{b.name}<span className="cnt mono">{buyerSize(b.id)}</span>
              </a>))}</div>}
            {!q && buyer && (
              <div className="bp-buyer">
                <div className="row"><Pic url={buyer.image_url} alt={buyer.name} size={48} /><div><h2>{buyer.name}</h2><span className="muted">{buyer.updated_at ? 'оновлено ' + when(buyer.updated_at) : 'ще не оновлювали'}</span></div></div>
                {isAdmin && <PicUpload label={'Картинка скупника ' + buyer.name} path={`buyers/${buyer.id}.webp`} onDone={async url => {
                  const { error } = await supabase!.from('buyers').update({ image_url: url }).eq('id', buyer.id); if (error) throw error; load();
                }} />}
                {isAdmin && (() => {
                  const nl = rows.filter(r => r.buyer_id === buyer.id && noLim(r)).length, un = unknown.filter(u => u.buyer_id === buyer.id);
                  const lr = rows.filter(r => r.buyer_id === buyer.id && limFor(r)).map(r => ({ r, l: limFor(r)! }));
                  return (
                    <div className="bp-admin">
                      <label className="mcheck"><input type="checkbox" checked={noLimOnly} onChange={e => setNoLimOnly(e.target.checked)} /> Лише без меж цін ({nl}) — програма бере їх лише з двох зчиток</label>
                      {un.length > 0 && <details><summary>Невідомі товари у скупника: {un.length}</summary>
                        <ul className="list">{un.map(u => (
                          <li key={u.id} className="row between"><span>{u.text} <small className="muted">· {u.seen_count} раз · {when(u.last_seen)}</small></span>
                            <button type="button" className="btn sm ghost" onClick={() => dropUnknown(u.id)}>Прибрати</button></li>))}</ul>
                      </details>}
                      {lr.length > 0 && <details><summary>Перевір межі: {lr.length}</summary>
                        <ul className="list">{lr.map(({ r, l }) => (
                          <li key={l.item_id} className="row between"><span>{r.items?.name} — у грі {money(l.price)}, межі {money(r.min_price)}–{money(r.max_price)} <small className="muted">· {l.seen_count} раз · {when(l.last_seen)}</small></span>
                            <button type="button" className="btn sm ghost" onClick={() => dropLimRep(l)}>Прибрати</button></li>))}</ul>
                      </details>}
                    </div>
                  );
                })()}
              </div>
            )}
            {!q && buyer && (
              <div className="cycle" role="status">
                <div><small>Свіжі ціни (до 3 год)</small><b className="mono">{fresh} з {cur.length}</b></div>
                <div><small>Останнє оновлення</small><b className="mono">{lastAt ? when(lastAt) : '—'}</b></div>
                <div className={'nextc' + (nxState === 'passed' ? ' due' : '')}>
                  <small><Icon name="clock" size={14} /> Наступна зміна цін</small>
                  {nextEdit !== null
                    ? <form className="row upd" onSubmit={e => { e.preventDefault(); saveNext(); }}>
                        <span className="muted">через</span>
                        <label className="fld dur"><input type="number" inputMode="numeric" min={0} max={24} aria-label="Годин до зміни цін" value={nextEdit.h} onChange={e => { setNextEdit({ ...nextEdit, h: e.target.value }); setNextErr(''); }} autoFocus /><span>год</span></label>
                        <label className="fld dur"><input type="number" inputMode="numeric" min={0} max={59} aria-label="Хвилин до зміни цін" value={nextEdit.m} onChange={e => { setNextEdit({ ...nextEdit, m: e.target.value }); setNextErr(''); }} /><span>хв</span></label>
                        <button className="btn sm acc">Зберегти</button>
                        <button type="button" className="btn sm ghost" onClick={() => { setNextEdit(null); setNextErr(''); }}>Скасувати</button>
                      </form>
                    : <b className="mono">{nxState === 'soon' ? `${when(nxAt).slice(-5)} · через ${dur(nxAt - tick)}` : nxState === 'passed' ? `була о ${when(nxAt).slice(-5)} — онови ціни` : 'невідомо'}</b>}
                  {nextEdit === null && nxState !== 'none' && nx?.nick && <small className="muted">вписав {nx.nick}</small>}
                  {nextErr && <small className="err" role="alert">{nextErr}</small>}
                  {nextEdit === null && session && <button type="button" className="btn sm ghost" onClick={() => setNextEdit({ h: '', m: '' })}>{nxState === 'soon' ? 'Оновити' : 'Вписати, через скільки'}</button>}
                </div>
              </div>
            )}
            {cur.length > 0 && <div className="bp-th" aria-hidden="true"><span>Товар · положення між мін і макс</span><span>30 днів</span><span>Ціна</span></div>}
            {cur.length ? (
              <div className="plist">{cur.map((r, i) => {
                const key = r.buyer_id + ':' + r.item_id, old = !!r.at && ms(r.at) < cs, isOpen = open === key, editing = edit[key] !== undefined;
                const raw = hist[key] || [], pts = series(raw, now), range = priceRange(raw, r.min_price, r.max_price, now), pos = rangePos(r.shown, range);
                /* підзаголовок перед блоком неосновної підгрупи («М'ясо»); основна й скупники з однією підгрупою — без нього */
                const sub = sort === 'name' && rk(r) > 0 && (i === 0 || cur[i - 1].items!.sub !== r.items!.sub) ? r.items!.sub : '';
                return (
                  <Fragment key={key}>
                  {sub && <h3 className="psub">{sub}</h3>}
                  <div className={'prow' + (isOpen ? ' open' : '')}>
                    <Pic url={r.items!.image_url} alt={r.items!.name} />
                    <button type="button" className="pname" aria-expanded={isOpen} aria-controls={'pd-' + key} onClick={() => toggle(key, r)}><b>{r.items!.name}</b>
                      <small>{q ? (buyers.find(b => b.id === r.buyer_id)?.name || '') + ' · ' : ''}{r.at ? <span className={old ? 'warn' : ''}>{when(r.at)} · {r.by}{old ? ' · може бути застаріла' : ''}</span> : 'ціни ще немає'}{isAdmin && limFor(r) && <span className="warn"> · перевір межі: у грі {money(limFor(r)!.price)}</span>}</small>
                      <RangeBar pos={pos} range={range} /></button>
                    <Spark pts={pts} now={now} />
                    <div className="pval">
                      {editing
                        ? <form className="row upd" onSubmit={e => { e.preventDefault(); savePrice(r); }}>
                            <label className="fld"><input autoFocus aria-label={'Нова ціна ' + r.items!.name} inputMode="numeric" value={edit[key]} onChange={e => setEdit({ ...edit, [key]: e.target.value })} style={{ width: 110 }} /></label>
                            <button className="btn sm acc" disabled={saving === key}>{saving === key ? 'Зберігаю…' : 'Зберегти'}</button>
                            <button type="button" className="btn sm ghost" onClick={() => { setEdit(e => { const n = { ...e }; delete n[key]; return n; }); setMsg(m => { const n = { ...m }; delete n[key]; return n; }); }}>Скасувати</button>
                          </form>
                        : <b className="mono">{r.shown ? money(r.shown) : '—'}</b>}
                      {!editing && <small className="muted">за {r.items!.unit}</small>}
                      {!editing && session && <button type="button" className={'btn sm ' + (old || !r.at ? 'acc' : 'ghost')} onClick={() => setEdit({ ...edit, [key]: r.shown ? String(r.shown) : '' })}>Оновити ціну</button>}
                      {msg[key] && <small className="err" role="alert">{msg[key]}</small>}
                    </div>
                    {isAdmin && <PicUpload label={'Картинка товару ' + r.items!.name} path={`items/${r.item_id}.webp`} onDone={async url => {
                      const { error } = await supabase!.from('items').update({ image_url: url }).eq('id', r.item_id); if (error) throw error; load();
                    }} />}
                    {isOpen && (
                      <div className="pdetail" id={'pd-' + key}>
                        <div className="stats">
                          <div><small>Зараз</small><b className="mono">{r.shown ? money(r.shown) : '—'}</b></div>
                          <div><small>Мінімум</small><b className="mono">{range ? money(range.min) : '—'}</b></div>
                          <div><small>Максимум</small><b className="mono">{range ? money(range.max) : '—'}</b></div>
                          <div><small>Положення</small><b className="mono">{pos === null ? '—' : pos + '%'}</b></div>
                        </div>
                        <p className="muted note">{range?.from === 'editor' ? 'Межі мінімум і максимум вписав редактор з гри.' : range ? 'Межі — найнижча і найвища ціна, що траплялися за 30 днів. Коли редактор впише межі з гри, вони будуть точнішими.' : 'Меж поки немає: потрібно щонайменше дві різні ціни за 30 днів або межі від редактора.'}</p>
                        <PriceChart raw={raw} range={range} name={r.items!.name} />
                        {isStaff && (
                          <form className="row lims" onSubmit={e => { e.preventDefault(); saveLimits(r); }}>
                            <label className="fld"><span>Мінімум скупника</span><input inputMode="numeric" value={lim.min} onChange={e => setLim({ ...lim, min: e.target.value })} style={{ width: 120 }} /></label>
                            <label className="fld"><span>Максимум скупника</span><input inputMode="numeric" value={lim.max} onChange={e => setLim({ ...lim, max: e.target.value })} style={{ width: 120 }} /></label>
                            <button className="btn sm acc">Зберегти межі</button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                  </Fragment>);
              })}</div>
            ) : q
              ? <div className="bp-empty">
                  <span className="bp-empty-ico" aria-hidden="true"><Icon name="search" size={28} /></span>
                  <h2>Нічого не знайдено за «{q.trim()}»</h2>
                  <p className="muted">Перевір написання або вибери скупника — у кожного свій список товарів.</p>
                  <button type="button" className="btn acc" onClick={() => setQ('')}>Скинути пошук</button>
                  <div className="bp-empty-chips">{buyers.map(b => <button key={b.id} type="button" className="btn ghost sm" onClick={() => pick(b.id)}><Pic url={b.image_url} alt={b.name} size={20} />{b.name}</button>)}</div>
                </div>
              : <div className="empty">У цього скупника ще немає товарів.</div>}
          </section>

          {/* калькулятор і як внести ціну */}
          <section className="bp-bottom">
            <div className="card bp-calc">
              <span className="h-kicker"><Icon name="coin" size={16} />Калькулятор</span>
              <h2>Скільки отримаєш у скупника</h2>
              {calcRow ? <>
                <div className="bp-calc-in">
                  <label className="fld"><span>Товар</span>
                    <select value={calcRow.buyer_id + ':' + calcRow.item_id} onChange={e => setCalc({ ...calc, key: e.target.value })}>
                      {priced.map(r => <option key={r.buyer_id + ':' + r.item_id} value={r.buyer_id + ':' + r.item_id}>{r.items!.name} — {buyerName(r.buyer_id)} · {money(r.price)}</option>)}
                    </select>
                  </label>
                  <label className="fld bp-qty"><span>Кількість, {calcRow.items!.unit}</span><input inputMode="numeric" value={calc.qty} onChange={e => setCalc({ ...calc, qty: e.target.value })} /></label>
                </div>
                <div className="bp-calc-out">
                  <div><small>За поточною ціною</small><b className="mono">{money(calcRow.price * calcQty)}</b></div>
                  <div><small>На максимумі скупника</small><b className="mono good">{calcRow.max_price > calcRow.price ? money(calcRow.max_price * calcQty) : '—'}</b></div>
                </div>
                {ms(calcRow.price_at) < cs && <small className="warn">Ціні понад 3 години — у грі вона могла змінитися.</small>}
              </> : <p className="muted">Ще немає цін для розрахунку.</p>}
            </div>
            <div className="card bp-how" id="add-price">
              <span className="h-kicker"><Icon name="camera" size={16} />Ціни вносять гравці</span>
              <h2>Бачиш іншу ціну в грі?</h2>
              <ol className="bp-steps">
                <li><span className="start-n p-n" aria-hidden="true">1</span><div><b>Автоматично через Q-Hub Desktop</b><p className="muted">Відкрий вікно скупника в грі — програма сама надішле ціни й час наступної зміни від твого імені.</p><Link to="/programa">Про програму →</Link></div></li>
                <li><span className="start-n p-n" aria-hidden="true">2</span><div><b>Скріншот вікна скупника</b><p className="muted">Завантаж знімок — сайт розпізнає ціни, а ти перевіриш перед збереженням. Або натисни «Оновити ціну» біля товару.</p></div></li>
              </ol>
              {session
                ? <ShotImport
                    catalog={rows.filter(r => r.items).map(r => ({ id: r.item_id, name: r.items!.name, buyer_id: r.buyer_id, min: r.min_price, max: r.max_price, price: r.price }))}
                    buyerName={buyerName} onBuyer={id => { setQ(''); setTab(id); }} onDone={() => load()} />
                : <button className="btn acc" onClick={signIn}>Увійти через Discord</button>}
            </div>
          </section>

          {/* останні оновлення й рейтинг */}
          <section className="card recent">
            <div className="row between rhead"><h2 className="ih"><Icon name="clock" />Останні оновлення цін</h2><Leaderboard list={top} /></div>
            {recent.length
              ? <ul className="ulist">{recent.map(g => {
                  /* один стиль для всіх записів: нік жирним на початку, під ним що саме оновлено */
                  const buyerLink = <a href={'#' + g.buyer_id} onClick={e => { e.preventDefault(); pick(g.buyer_id); }}>{buyerName(g.buyer_id)}</a>;
                  const one = g.items.length === 1, all = !one && g.items.length >= buyerSize(g.buyer_id);
                  return <li key={g.key}>
                    <div className="ug-head"><b>{g.who}</b>
                      <span className="muted">{one ? 'оновив ціну' : all ? 'оновив усі ціни' : `оновив ${g.items.length} цін`} · {buyerLink}</span>
                      <span className={'ug-at' + (ms(g.at) < cs ? ' muted' : '')}>{when(g.at)}</span></div>
                    <div className="ug-items">{one
                      ? <>{itemName(g.items[0].item_id)} — <b className="mono">{money(g.items[0].price)}</b></>
                      : g.items.map(u => itemName(u.item_id)).sort((a, b) => a.localeCompare(b, 'uk')).join(', ')}</div>
                  </li>;
                })}</ul>
              : <div className="empty">Гравці ще не оновлювали ціни. Будь першим — натисни «Оновити ціну» біля товару вище.</div>}
            {groups.length > SHOWN && <button type="button" className="btn sm ghost" aria-expanded={allUps} onClick={() => setAllUps(v => !v)}>{allUps ? 'Сховати' : `Показати ще ${Math.min(groups.length, 30) - SHOWN}`}</button>}
          </section>
        </>
      )}
    </div>
  );
}
