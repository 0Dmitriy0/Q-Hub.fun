import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import PicUpload from '../components/PicUpload';
import VehicleDialog, { KIND_ICON, type VehicleFull } from '../components/VehicleDialog';
import Select from '../components/Select';
import { priceKind, priceSortKey, salonLabel, type PriceKind } from '../lib/vehiclePrice';

type Kind = VehicleFull['kind'];
type Vehicle = VehicleFull;
interface Score { vehicle_id: number; avg: number; votes: number }
type Sort = 'price' | 'speed' | 'trunk' | 'rating' | 'name';

const KINDS: [Kind | 'all', string, string][] = [['all', 'Усі', 'car'], ['auto', 'Авто', 'car'], ['moto', 'Мото', 'moto'], ['avia', 'Авіа', 'plane'], ['boat', 'Водний', 'boat']];
const SORT_ICON: Record<Sort, string> = { price: 'tag', speed: 'speed', trunk: 'box', rating: 'star', name: 'search' };
const SORTS: [Sort, string][] = [['price', 'Ціна'], ['speed', 'Швидкість'], ['trunk', 'Багажник'], ['rating', 'Оцінка гравців'], ['name', 'Назва']];

const seatsWord = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'місце' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'місця' : 'місць'; };

/* середня оцінка всіх гравців — зірки з дробовим заповненням (3,5 = три з половиною) */
function AvgStars({ avg, votes }: { avg: number; votes: number }) {
  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  return (
    <div className="avg" aria-label={votes ? `Середня оцінка ${avg.toFixed(1)} з 5, ${votes} ${votesWord(votes)}` : 'Ще без оцінок'}>
      <span className="avg-stars" aria-hidden="true">
        <span className="avg-bg">{[1, 2, 3, 4, 5].map(n => <Icon key={n} name="star" size={20} />)}</span>
        <span className="avg-fg" style={{ width: pct + '%' }}>{[1, 2, 3, 4, 5].map(n => <Icon key={n} name="star" size={20} />)}</span>
      </span>
      {votes ? <span><b className="mono">{avg.toFixed(1)}</b><span className="muted"> з 5 · {votes} {votesWord(votes)}</span></span> : <span className="muted">ще без оцінок</span>}
    </div>
  );
}
const votesWord = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'оцінка' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'оцінки' : 'оцінок'; };

/* своя оцінка — окремо від середньої: клік по зірці ставить або змінює */
function MyStars({ mine, onRate }: { mine: number; onRate: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || mine;
  return (
    <div className="mine-row">
      <small className="muted">{mine ? 'Твоя оцінка' : 'Оціни'}</small>
      <div className="stars-row" role="radiogroup" aria-label="Твоя оцінка" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={mine === n} aria-label={`${n} з 5`} className={'star sm' + (n <= shown ? ' on' : '')}
          onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => onRate(n)}><Icon name="star" size={16} /></button>)}
      </div>
    </div>
  );
}

export default function Transport() {
  const { session, signIn, role } = useAuth();
  const isAdmin = role === 'admin';
  const [list, setList] = useState<Vehicle[]>([]);
  const [scores, setScores] = useState<Record<number, Score>>({});
  const [mine, setMine] = useState<Record<number, number>>({});
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('price');
  const [fuel, setFuel] = useState<'all' | 'petrol' | 'electric'>('all');
  const [cur, setCur] = useState<'all' | PriceKind>('all');
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  async function load() {
    if (!supabase) return;
    const [v, s] = await Promise.all([
      supabase.from('vehicles').select('*').order('price', { ascending: false }).limit(1000),
      supabase.from('vehicle_scores').select('*')
    ]);
    setLoaded(true);
    if (v.error) { setErr('Не вдалося завантажити транспорт. Онови сторінку.'); return; }
    /* фото з маркетплейсу гри лежать на самому сайті (public/vehicles/map.json); фото, завантажене адміном, важливіше.
       Самі фото браузер кешує на тиждень, тому оновлене фото отримує в map.json нову ?v=, а map.json читається без кешу */
    const pics: Record<string, string> = await fetch('/vehicles/map.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
    setList((v.data as Vehicle[]).map(x => (x.image_url || !pics[x.name] ? x : { ...x, image_url: pics[x.name] })));
    setScores(Object.fromEntries(((s.data || []) as Score[]).map(x => [x.vehicle_id, { ...x, avg: Number(x.avg), votes: Number(x.votes) }])));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!supabase || !session) { setMine({}); return; }
    supabase.from('vehicle_ratings').select('vehicle_id,stars').then(({ data }) => setMine(Object.fromEntries((data || []).map(r => [r.vehicle_id, r.stars]))));
  }, [session?.user.id]);

  async function rate(id: number, stars: number) {
    if (!supabase || !session) return;
    /* середня перераховується одразу; потім база дасть точне значення */
    const prev = mine[id] ?? 0, cur = scores[id] ?? { vehicle_id: id, avg: 0, votes: 0 };
    const votes = cur.votes + (prev ? 0 : 1), avg = (cur.avg * cur.votes - prev + stars) / votes;
    setScores(sc => ({ ...sc, [id]: { vehicle_id: id, avg, votes } }));
    setMine(m => ({ ...m, [id]: stars }));
    const { error } = await supabase.from('vehicle_ratings').upsert({ vehicle_id: id, user_id: session.user.id, stars, updated_at: new Date().toISOString() });
    if (error) { alert('Не вдалося зберегти оцінку. Спробуй ще раз.'); return; }
    const { data } = await supabase.from('vehicle_scores').select('*').eq('vehicle_id', id).maybeSingle();
    if (data) setScores(sc => ({ ...sc, [id]: { vehicle_id: id, avg: Number(data.avg), votes: Number(data.votes) } }));
  }

  const topSpeed = useMemo(() => list.reduce((m, v) => Math.max(m, v.speed || 0), 0), [list]);
  const counts = useMemo(() => ({ all: list.length, auto: list.filter(v => v.kind === 'auto').length, moto: list.filter(v => v.kind === 'moto').length, avia: list.filter(v => v.kind === 'avia').length, boat: list.filter(v => v.kind === 'boat').length }), [list]);
  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const r = list.filter(v => (kind === 'all' || v.kind === kind) && (fuel === 'all' || (v.fuel || 'petrol') === fuel) && (cur === 'all' || priceKind(v) === cur) && (!ql || (v.name + ' ' + v.brand).toLowerCase().includes(ql)));
    const num = (x: number | null) => x ?? -1;
    return r.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'uk')
      : sort === 'rating' ? (scores[b.id]?.avg ?? 0) - (scores[a.id]?.avg ?? 0) || (scores[b.id]?.votes ?? 0) - (scores[a.id]?.votes ?? 0)
      : sort === 'speed' ? num(b.speed) - num(a.speed) : sort === 'trunk' ? num(b.trunk) - num(a.trunk) : (() => { const x = priceSortKey(a), y = priceSortKey(b); return x[0] - y[0] || y[1] - x[1]; })());
  }, [list, kind, q, sort, scores, fuel, cur]);

  return (
    <>
      <section className="wiki-hero">
        <div>
          <span className="h-pill"><span className="mdot" aria-hidden="true" />Каталог автосалонів</span>
          <h1>Транспорт штату</h1>
          <p className="muted">Держ. ціна, швидкість, пальне й багажник. Зірки на картці — середня оцінка всіх гравців. Увійди, щоб поставити свою від 1 до 5: вона одразу врахується в середній. Натисни на транспорт — відкриється калькулятор тюнінгу.</p>
        </div>
        <div className="wiki-stats">
          <div><b className="mono">{list.length || '—'}</b><small>Усього моделей</small></div>
          <div><b className="mono">{topSpeed ? topSpeed + ' км/год' : '—'}</b><small>Найшвидший</small></div>
        </div>
      </section>
      {!supabase && <div className="card empty">База ще не підключена.</div>}
      {err && <div className="card err">{err}</div>}
      <div className="tbar">
        <div className="tabs" role="tablist" aria-label="Тип транспорту">{KINDS.map(([k, label, ico]) => (
          <a key={k} href={'#' + k} role="tab" aria-selected={kind === k} className={'tabpic' + (kind === k ? ' active' : '')} onClick={e => { e.preventDefault(); setKind(k); }}>
            <Icon name={ico} size={16} />{label}<span className="cnt">{counts[k]}</span>
          </a>))}</div>
        <div className="tbar-row">
          <div className="fld has-ico grow"><Icon name="search" /><input type="search" placeholder="Пошук за назвою або маркою" value={q} onChange={e => setQ(e.target.value)} aria-label="Пошук транспорту" /></div>
          <div className="fld sortf"><Select label="Валюта" value={cur} onChange={setCur}
            options={[{ value: 'all', label: 'Будь-яка валюта', icon: 'tag' }, { value: 'game', label: 'Ігрова валюта', icon: 'tag' }, { value: 'donate', label: 'Донатна валюта', icon: 'coin' }, { value: 'exclusive', label: 'Ексклюзив', icon: 'star' }]} /></div>
          <div className="fld sortf"><Select label="Двигун" value={fuel} onChange={setFuel}
            options={[{ value: 'all', label: 'Пальне й електро', icon: 'car' }, { value: 'petrol', label: 'Лише на пальному', icon: 'fuel' }, { value: 'electric', label: 'Лише електро', icon: 'bolt' }]} /></div>
          <div className="fld sortf"><Select label="Сортування" value={sort} onChange={setSort} options={SORTS.map(([k, l]) => ({ value: k, label: l, icon: SORT_ICON[k] }))} /></div>
        </div>
      </div>
      {!session && list.length > 0 && <div className="card row between"><span>Увійди через Discord, щоб оцінювати транспорт.</span><button className="btn acc sm" onClick={signIn}>Увійти</button></div>}
      {loaded && !err && !list.length && <div className="card empty">Каталог транспорту ще порожній — його саме заповнюємо.</div>}
      {list.length > 0 && <div className="wiki-count"><span>Показано <b className="mono">{shown.length}</b> з {list.length}</span><span className="muted">Натисни на картку — відкриється тюнінг</span></div>}
      {shown.length > 0 && (
        <div className="vgrid">{shown.map(v => {
          const sc = scores[v.id];
          return (
            /* уся плитка відкриває вікно транспорту; кнопки всередині (оцінка, фото) працюють як і раніше */
            <article className={'card vcard' + (v.exclusive ? ' excl' : '')} key={v.id} onClick={e => { if (!(e.target as HTMLElement).closest('button, input, label, select, a')) setOpenId(v.id); }}>
              <div className="vpic">{v.exclusive && <span className="excl-badge" title="Ексклюзивний транспорт — у салоні не купити"><Icon name="star" size={14} />Ексклюзив</span>}{v.image_url ? <img src={v.image_url} alt={v.name} loading="lazy" /> : <Icon name={KIND_ICON[v.kind]} size={40} />}
                {isAdmin && <span className="vpic-up"><PicUpload label={'Фото транспорту ' + v.name} path={`vehicles/${v.id}.webp`} frame={{ w: 640, h: 360 }} onDone={async url => {
                  const { error } = await supabase!.from('vehicles').update({ image_url: url }).eq('id', v.id); if (error) throw error;
                  setList(l => l.map(x => (x.id === v.id ? { ...x, image_url: url } : x)));
                }} /></span>}
              </div>
              <div className="vhead"><h3><button type="button" className="vopen" onClick={() => setOpenId(v.id)}>{v.name}</button></h3>{v.brand && <small className="muted">{v.brand}{v.salon ? ' · ' + v.salon : ''}</small>}</div>
              <b className={'mono vprice' + (priceKind(v) === 'donate' ? ' donate-c' : priceKind(v) === 'exclusive' ? ' excl-c' : '')} title={priceKind(v) === 'donate' ? 'Купується за донатну валюту' : undefined}>
                {priceKind(v) === 'donate' && <Icon name="coin" size={17} />}{priceKind(v) === 'exclusive' && <Icon name="star" size={16} />}{salonLabel(v)}</b>
              <ul className="vspec">
                {v.speed != null && <li><Icon name="speed" size={15} />{v.speed} км/год</li>}
                {v.trunk != null && <li><Icon name="box" size={15} />{v.trunk} слот(ів)</li>}
                {v.fuel === 'electric' ? <li className="fuel-tag el"><Icon name="bolt" size={15} />Електро</li> : <li className="fuel-tag"><Icon name="fuel" size={15} />Пальне{v.tank != null ? ` · ${v.tank} л` : ''}</li>}
                {v.seats != null && <li><Icon name="user" size={15} />{v.seats} {seatsWord(v.seats)}</li>}
              </ul>
              <div className="stars">
                <AvgStars avg={sc?.avg ?? 0} votes={sc?.votes ?? 0} />
                {session && <MyStars mine={mine[v.id] ?? 0} onRate={n => rate(v.id, n)} />}
              </div>
            </article>);
        })}</div>
      )}
      <VehicleDialog v={list.find(x => x.id === openId) ?? null} onClose={() => setOpenId(null)} canEdit={isAdmin || role === 'editor'}
        onSaved={nv => setList(l => l.map(x => (x.id === nv.id ? nv : x)))} />
      {loaded && list.length > 0 && !shown.length && <div className="card empty wiki-none"><b>Нічого не знайдено</b><span className="muted">Спробуй іншу назву або тип.</span><button type="button" className="btn acc sm" onClick={() => { setQ(''); setKind('all'); setFuel('all'); setCur('all'); }}>Скинути фільтри</button></div>}
      {list.length > 0 && <div className="wiki-tiles one">
        <div className="card"><span className="ibub"><Icon name="speed" /></span><div><b>Калькулятор тюнінгу у вікні кожного авто</b><p className="muted">Відміть потрібні елементи — побачиш суму тюнінгу й ціну разом з авто, а також швидкість з чіпами Stage 1–4.</p></div></div>
      </div>}
    </>
  );
}
