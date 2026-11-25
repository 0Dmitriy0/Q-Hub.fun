import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EventsBlock from '../components/EventsBlock';
import HalloweenBanner from '../components/HalloweenBanner';
import SitePromo from '../components/SitePromo';
import TeamBlock from '../components/TeamBlock';
import { useAuth } from '../lib/auth';
import { fmt, money } from '../lib/format';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icon';
import { readGameTheme, recolor, saveGameTheme, type GameTheme } from '../lib/gameTheme';
import { OCEAN, mapUrl } from '../lib/mapGeo';
import { eventStatus, kyHM, dur } from '../lib/events';
import { STALE } from '../lib/pricestats';
import { readCache, readSnapshot } from '../lib/priceCache';
import { groupUpdates, type Update } from '../lib/updates';
import { JOBS } from '../data/jobs';

/* мапа (Leaflet) — окремим файлом: вона нижче першого екрана, а перший кадр без неї легший */
const MiniMap = lazy(() => import('../components/MiniMap'));

/* Головна (редизайн 2026-11): спершу те, по що гравець приходить, — що зараз у штаті. Живий відлік до івенту, ціни, які
   щойно внесли гравці, і хто їх вніс. Далі мапа, програма, покажчик довідника, сезонні івенти, як почати, команда.
   Усі числа справжні: розклад — src/lib/events.ts, ціни — збережені в браузері → знімок сайту → жива база */

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return 'щойно';
  if (m < 60) return `${m} хв тому`;
  const h = Math.round(m / 60); if (h < 48) return `${h} год тому`;
  return `${Math.round(h / 24)} дн тому`;
}

export default function Home() {
  const { session, signIn } = useAuth();
  /* скільки даних у довіднику (транспорт і роботи — без схованих сторінок) і міток на мапі; помилка — без числа */
  const [counts, setCounts] = useState<{ vehicles: number | null; jobs: number | null; buyers: number | null; pins: number | null }>({ vehicles: null, jobs: null, buyers: null, pins: null });
  useEffect(() => {
    if (!supabase) return;
    const count = (t: string, hidden = true) => {
      const q = supabase!.from(t).select('id', { count: 'exact', head: true });
      return (hidden ? q.not('hidden', 'is', true) : q).then(r => (r.error ? null : r.count));
    };
    Promise.all([count('vehicles'), count('jobs'), count('buyers', false), supabase.rpc('site_stats').then(r => (r.error ? null : (r.data as { pins?: number } | null)?.pins ?? null))])
      .then(([vehicles, jobs, buyers, pins]) => setCounts({ vehicles, jobs, buyers, pins }));
  }, []);

  return (
    <div className="home">
      {/* 1. що це за сайт — і промокод, по який часто приходять з Discord */}
      <section className="hx">
        <div className="hx-intro">
          <Dateline />
          <h1>Ціни, мапа й івенти Quant RP</h1>
          <p className="hx-lead">Ціни скупників вносять самі гравці. На мапі — усі точки штату з пошуком, розклад івентів — за київським часом. Те саме відкривається просто в грі за <kbd>Alt</kbd>+<kbd>Q</kbd>.</p>
          <div className="row hx-act">
            <Link className="btn acc" to="/mapa"><Icon name="map" />Відкрити мапу</Link>
            <Link className="btn" to="/tsiny"><Icon name="buyer" />Ціни скупників</Link>
          </div>
        </div>
        <SitePromo />
      </section>

      {/* 2. табло: що зараз у штаті */}
      <section className="board" aria-label="Зараз у штаті">
        <NextEvent />
        <PriceBoard />
      </section>

      <HalloweenBanner />

      {/* 3. мапа */}
      <section className="h-sec" id="mapa">
        <div className="h-head">
          <h2>Мапа штату</h2>
          <p className="muted">Магазини, роботи, скупники, поля полювання й скарбів, зелені зони. Набери «24/7» чи «риболовля» — мапа покаже всі збіги{counts.pins ? <>, а всього міток — <b className="fg">{fmt(counts.pins)}</b></> : null}.</p>
        </div>
        <div className="h-split">
          <Suspense fallback={<div className="mini" aria-busy="true"><div className="mini-map" /></div>}><MiniMap /></Suspense>
          <GameMapTile />
        </div>
      </section>

      {/* 4. програма — смуга «моря» на всю ширину */}
      <section className="band hp" aria-labelledby="hp-h">
        <div className="hp-txt">
          <h2 id="hp-h">Програма: усе це — поверх гри</h2>
          <p className="hp-lead">Натисни <kbd>Alt</kbd>+<kbd>Q</kbd> у GTA V — відкриється рядок з цінами скупників, правилами сервера й мапою. Гру згортати не треба.</p>
          <ul className="hp-list">
            <li><b>Прибуток за годину.</b> Програма бачить готівку й картку в HUD гри і показує середній заробіток сеансу. Нікуди не записує — лише рахує.</li>
            <li><b>Ціни прямо зі скупника.</b> Відкрив вікно скупника — ціни пішли в спільну базу від твого імені, з тими самими перевірками, що й ручне внесення.</li>
            {/* 50 — як AI_DAY у src/desktop/Settings.tsx і 0027_assistant_limit_50.sql */}
            <li><b>Правила й помічник.</b> Enter шукає в правилах сервера, Shift+Enter питає ШІ-помічника: 50 питань на день, ліміт оновлюється опівночі за Києвом.</li>
          </ul>
        </div>
        <div className="hp-get">
          <span className="hp-keys" aria-label="Alt плюс Q"><kbd>Alt</kbd><span aria-hidden="true">+</span><kbd>Q</kbd></span>
          <Link className="btn acc" to="/programa"><Icon name="download" />Завантажити програму</Link>
          <p className="muted">Безкоштовно, для Windows 10 і 11, оновлюється сама. Не читає пам'ять гри й нічого в ній не натискає — лише робить знімки екрана, як OBS.</p>
        </div>
      </section>

      {/* 5. довідник — покажчик з числами, як в атласі */}
      <section className="h-sec" aria-labelledby="ix-h">
        <div className="h-head"><h2 id="ix-h">Довідник гравця</h2></div>
        <ul className="ix">
          <IxRow to="/wiki/roboty" n={counts.jobs ?? JOBS.length} name="Роботи" text="З якого рівня, де влаштуватися, оплата й точка на мапі" />
          <IxRow to="/wiki/transport" n={counts.vehicles} name="Транспорт" text="Ціна в салоні, швидкість, багажник і калькулятор тюнінгу" />
          <IxRow to="/tsiny" n={counts.buyers} name="Скупники" text="Хто зараз дає більше, межі цін і графік за 30 днів" />
          <IxRow to="/wiki/iventy" name="Івенти" text="Щогодинний розклад і сезонні події з квестами й нагородами" />
          <IxRow to="/wiki/gaidy" name="Гайди" text="Перші кроки новачка, банди, сім'ї, далекобійники" />
          <IxRow to="/wiki/glosariy" name="Глосарій" text="Що означають ДМ, ДБ, ПГ, МГ та інші скорочення" />
        </ul>
      </section>

      {/* 6. сезонні івенти й промокоди сервера + як почати */}
      <section className="h-two">
        <EventsBlock />
        <div className="start">
          <h2>Як почати грати на Quant RP</h2>
          <ol className="start-list">
            <li>
              <h3>Придбай GTA V з останнім патчем</h3>
              <p className="muted">Потрібна ліцензійна Grand Theft Auto V від Rockstar з офіційних магазинів: Steam, Epic Games або Social Club.</p>
              <a className="btn sm" href="https://store.steampowered.com/app/271590/Grand_Theft_Auto_V_Legacy/" target="_blank" rel="noopener noreferrer"><Icon name="tag" size={16} />Купити гру<span className="vh"> у Steam (відкриється в новій вкладці)</span></a>
            </li>
            <li>
              <h3>Встанови лаунчер Quant RP</h3>
              <p className="muted">Офіційний лаунчер проєкту — через нього заходиш на сервер.</p>
              <a className="btn sm" href="https://quant5.com.ua/quant-install.exe" download><Icon name="download" size={16} />Завантажити лаунчер<span className="vh"> Quant RP (.exe)</span></a>
            </li>
            <li>
              <h3>Заходь у гру й підключи Q-Hub</h3>
              <p className="muted">Отримай оновлення в лаунчері й заходь на <b>Quant RP — GTA V</b>. Тут увійди через Discord і додай персонажа в кабінеті.</p>
              {session ? <Link className="btn sm acc" to="/kabinet"><Icon name="user" size={16} />Відкрити кабінет</Link> : <button className="btn sm acc" onClick={signIn}><Icon name="user" size={16} />Увійти через Discord</button>}
            </li>
          </ol>
        </div>
      </section>

      {/* 7. команда (0062) — склад з бази; порожньо — блоку немає */}
      <TeamBlock />
    </div>
  );
}

/* день і час у Києві — розклад івентів і зміна цін ідуть за ним */
const dayFmt = (() => { try { return new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Kyiv' }); } catch { return null; } })();
function Dateline() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);
  const day = dayFmt ? dayFmt.format(new Date(now)) : '';
  return <p className="hx-date">{day ? day[0].toUpperCase() + day.slice(1) + ', ' : ''}<span className="hx-time">{kyHM(now)}</span> у Києві</p>;
}

/* відлік до найближчого івенту (або до кінця того, що йде): цифри як на табло, оновлюються щосекунди */
const pad = (n: number) => String(n).padStart(2, '0');
function clock(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function NextEvent() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const list = eventStatus(now);
  const live = list.filter(s => s.now).sort((a, b) => a.now!.e - b.now!.e)[0];
  const soon = list.filter(s => s.next).sort((a, b) => a.next!.s - b.next!.s);
  const head = live ? { name: live.ev.name, on: true, at: live.now!.e, from: live.now!.s } : soon[0] ? { name: soon[0].ev.name, on: false, at: soon[0].next!.s, from: 0 } : null;
  const rest = soon.filter(s => !head || head.on || s.ev.name !== head.name).slice(0, 3);
  return (
    <div className={'bd ne' + (head?.on ? ' on' : '')}>
      <div className="bd-head"><h2>{head?.on ? 'Зараз іде' : 'Наступний івент'}</h2><Link className="bd-more" to="/wiki/iventy">Розклад</Link></div>
      {head && <div className="ne-main">
        <b className="ne-name">{head.name}</b>
        <span className="ne-cd" role="timer" aria-label={head.on ? `закінчиться о ${kyHM(head.at)}` : `почнеться о ${kyHM(head.at)}, через ${dur(head.at - now)}`}>{clock(head.at - now)}</span>
        <span className="ne-when">{head.on ? `${kyHM(head.from)}–${kyHM(head.at)}, до кінця` : `о ${kyHM(head.at)}, до початку`}</span>
      </div>}
      <ul className="ne-next" aria-label="Далі за розкладом">
        {rest.map(s => <li key={s.ev.id}><span>{s.ev.name}</span><span className="ne-t"><b>{kyHM(s.next!.s)}</b><small>через {dur(s.next!.s - now)}</small></span></li>)}
      </ul>
    </div>
  );
}

/* ціни на головній: ті самі дані, що на сторінці цін (src/pages/Prices.tsx), — спершу збережені в браузері чи знімок
   сайту, потім жива база. «Вигідно здати» — свіжа ціна (до 3 год) найближче до максимуму скупника; свіжих немає —
   просто останні внесені ціни. Поруч — хто з гравців щойно оновлював */
type HItem = { name: string; unit: string; image_url: string | null };
type HRow = { buyer_id: string; item_id: number; price: number | null; min_price?: number | null; max_price?: number | null; price_at: string | null; items: HItem | null };
type HBuyer = { id: string; name: string; fixed_prices?: boolean | null };
type HData = { at: string; buyers: HBuyer[]; rows: HRow[]; ups: Update[] };

function usePrices() {
  const [d, setD] = useState<HData | null>(() => readCache<HData>());
  useEffect(() => {
    let live = false;
    readSnapshot<HData>().then(s => { if (s && !live) setD(c => (!c || s.at > c.at ? s : c)); });
    if (!supabase) return;
    Promise.all([
      supabase.from('buyers').select('*').order('sort'),
      supabase.from('buyer_items').select('buyer_id,item_id,min_price,max_price,price,price_at,items(name,unit,image_url)'),
      supabase.from('price_updates').select('*').order('created_at', { ascending: false }).limit(80)
    ]).then(([b, r, u]) => {
      if (b.error || r.error) return;   // без бази лишаються збережені чи знімок
      live = true;
      setD({ at: new Date().toISOString(), buyers: b.data as HBuyer[], rows: r.data as unknown as HRow[], ups: u.error ? [] : (u.data as Update[]) });
    });
  }, []);
  return d;
}

function PriceBoard() {
  const d = usePrices();
  const buyerName = (id: string) => d?.buyers.find(b => b.id === id)?.name || id;
  const itemName = (id: number) => d?.rows.find(r => r.item_id === id)?.items?.name || 'товар';
  const fixed = new Set((d?.buyers || []).filter(b => b.fixed_prices).map(b => b.id));
  const now = Date.now();
  const priced = (d?.rows || []).filter(r => r.items && r.price && r.price_at);
  const best = priced
    .filter(r => !fixed.has(r.buyer_id) && (r.min_price || 0) > 0 && (r.max_price || 0) > (r.min_price || 0) && now - Date.parse(r.price_at!) < STALE)
    .map(r => ({ r, pos: Math.max(0, Math.min(100, Math.round(((r.price! - r.min_price!) / (r.max_price! - r.min_price!)) * 100))) }))
    .sort((a, b) => b.pos - a.pos).slice(0, 5);
  const rows: { r: HRow; pos: number | null }[] = best.length ? best : priced.sort((a, b) => Date.parse(b.price_at!) - Date.parse(a.price_at!)).slice(0, 5).map(r => ({ r, pos: null as number | null }));
  const groups = groupUpdates(d?.ups || []).slice(0, 5);
  return <>
    <div className="bd">
      <div className="bd-head"><h2>{best.length ? 'Вигідно здати зараз' : 'Останні ціни від гравців'}</h2><Link className="bd-more" to="/tsiny">Усі ціни</Link></div>
      {!d ? <p className="bd-empty">Завантажуємо ціни…</p> : !rows.length ? <p className="bd-empty">Цін ще немає — внеси першу на сторінці цін.</p> :
        <ul className="pb">{rows.map(({ r, pos }) => (
          <li key={r.buyer_id + ':' + r.item_id}>
            <Link to={'/tsiny#' + r.buyer_id} className="pb-row">
              {r.items!.image_url ? <img className="pic" src={r.items!.image_url} alt="" width={36} height={36} loading="lazy" /> : <span className="pic none" style={{ width: 36, height: 36 }} aria-hidden="true">{r.items!.name[0]}</span>}
              <span className="pb-name"><b>{r.items!.name}</b><small>{buyerName(r.buyer_id)}, {ago(r.price_at!)}</small></span>
              <span className="pb-val"><b>{money(r.price!)}</b><small>{pos !== null ? <span className={pos >= 80 ? 'good' : ''}>{pos}% від макс.</span> : `за ${r.items!.unit}`}</small></span>
            </Link>
          </li>))}</ul>}
    </div>
    <div className="bd">
      <div className="bd-head"><h2>Хто оновлював ціни</h2><Link className="bd-more" to="/tsiny">Оновити ціни</Link></div>
      {!d ? <p className="bd-empty">Завантажуємо…</p> : !groups.length ? <p className="bd-empty">Гравці ще не оновлювали ціни. Будь першим — це займає хвилину.</p> :
        <ul className="ug">{groups.map(g => (
          <li key={g.key}>
            <span className="ug-who"><b>{g.who}</b><small>{ago(g.at)}</small></span>
            <span className="ug-what">{g.items.length === 1
              ? <>{itemName(g.items[0].item_id)} — <b>{money(g.items[0].price)}</b>, <Link to={'/tsiny#' + g.buyer_id}>{buyerName(g.buyer_id)}</Link></>
              : <>{g.items.length} цін у <Link to={'/tsiny#' + g.buyer_id}>{buyerName(g.buyer_id)}</Link></>}</span>
          </li>))}</ul>}
    </div>
  </>;
}

function IxRow({ to, n, name, text }: { to: string; n?: number | null; name: string; text: string }) {
  return (
    <li><Link className="ix-row" to={to}>
      <span className="ix-n" aria-hidden={n == null}>{n == null ? '' : fmt(n)}</span>
      <span className="ix-t"><b>{name}</b><span>{text}</span></span>
      <Icon name="chev" size={18} />
    </Link></li>
  );
}

/* плитка «Мапа для Quant RP» (specs/026): мініатюра мапи для гри у вибраній темі, три кроки й кнопка у вікно збирання.
   Мініатюра — плитка z0 мапи сайту (12800 м на 256 px), обрізана до ділянки текстур гри (2×3 по 4500 м від -4140, 8400) */
const Z0 = 256 / 12800, THUMB_W = 124, THUMB_K = THUMB_W / (9000 * Z0);
function GameMapTile() {
  const [theme, setThemeState] = useState<GameTheme>(readGameTheme);
  const setTheme = (t: GameTheme) => { setThemeState(t); saveGameTheme(t); };
  return (
    <div className="h-dl">
      <div className="h-dl-body">
        <span className="h-dl-map" style={{ width: THUMB_W, height: 13500 * Z0 * THUMB_K, background: recolor(OCEAN, theme) }}>
          <img src={mapUrl(theme === 'light' ? '/map/light/0/0/0.webp' : '/map/0/0/0.webp')} alt={`Мапа для гри — ${theme === 'light' ? 'світла' : 'темна'} тема`} loading="lazy"
            style={{ width: 256 * THUMB_K, left: -(-4140 + 5996) * Z0 * THUMB_K, top: -(8470 - 8400) * Z0 * THUMB_K }} />
        </span>
        <div className="h-dl-txt">
          <h3>Та сама мапа — на мінікарті в грі</h3>
          <p className="muted">Галочками вибираєш назви, зони й мітки — сайт збирає архів мінікарти, а ти ставиш його через OpenIV.</p>
          <div className="mseg" role="radiogroup" aria-label="Тема мапи для гри">
            <button type="button" role="radio" aria-checked={theme === 'dark'} onClick={() => setTheme('dark')}>Темна</button>
            <button type="button" role="radio" aria-checked={theme === 'light'} onClick={() => setTheme('light')}>Світла</button>
          </div>
        </div>
      </div>
      <ol className="h-dl-steps">
        <li>Вибери мітки — перегляд одразу покаже, що буде на мінікарті</li>
        <li>Скачай архів .zip</li>
        <li>Постав через OpenIV — <Link to="/mapa/v-gru">інструкція</Link></li>
      </ol>
      <div className="row">
        <Link className="btn acc" to="/mapa?game=1"><Icon name="download" />Зібрати мапу для гри</Link>
      </div>
    </div>
  );
}
