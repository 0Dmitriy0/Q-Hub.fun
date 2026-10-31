import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EventsBlock from '../components/EventsBlock';
import HalloweenBanner from '../components/HalloweenBanner';
import MiniMap from '../components/MiniMap';
import SitePromo from '../components/SitePromo';
import { useAuth } from '../lib/auth';
import { fmt, money } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAppOnline } from '../lib/useAppOnline';
import Icon from '../components/Icon';
import { readGameTheme, recolor, saveGameTheme, type GameTheme } from '../lib/gameTheme';
import { OCEAN, mapUrl } from '../lib/mapGeo';

/* головна за макетом Stitch (design/stitch/home.html). Усі цифри справжні: зі знімка цін (public/snapshot) і даних сайту.
   Вигадані блоки макета (кількість гравців, «радар-мод», ШІ-рекомендації з відсотками) не перенесено */
type SiteStats = { players: number; pins: number; downloads: number | null };
type Snap = { buyers: { id: string; name: string }[]; rows: { buyer_id: string; item_id: number; price: number | null; price_at: string | null; items: { name: string; unit: string; image_url: string | null } }[]; ups: unknown[] };

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return `${m} хв тому`;
  const h = Math.round(m / 60); if (h < 48) return `${h} год тому`;
  return `${Math.round(h / 24)} дн тому`;
}

export default function Home() {
  const { session, signIn } = useAuth();
  const [snap, setSnap] = useState<Snap | null>(null);
  useEffect(() => { fetch('/snapshot/prices.json').then(r => (r.ok ? r.json() : null)).then(setSnap).catch(() => { /* без знімка — блоки з цінами просто порожні */ }); }, []);
  const buyerName = (id: string) => snap?.buyers.find(b => b.id === id)?.name || id;
  const fresh = (snap?.rows || []).filter(r => r.price && r.price_at).sort((a, b) => Date.parse(b.price_at!) - Date.parse(a.price_at!)).slice(0, 5);
  const online = useAppOnline();
  const [site, setSite] = useState<SiteStats | null>(null);
  useEffect(() => { supabase?.rpc('site_stats').then(({ data, error }) => { if (!error && data) setSite(data as SiteStats); }); }, []);
  const n = (v: number | null | undefined) => (v == null ? '—' : fmt(v));
  /* плитки про сам Q-Hub, а не про гру (specs/011); поки число не відоме — «—» */
  const stats: [string, string, string][] = [
    ['Гравців у Q-Hub', n(site?.players), 'увійшли на сайт через Discord'],
    ['Зараз у програмі', n(online), online === 0 ? 'будь першим — Alt+Q' : 'гравців із запущеним Q-Hub'],
    ['Завантажень програми', n(site?.downloads), 'Q-Hub Desktop із сайту'],
    ['Міток на мапі', n(site?.pins), 'на мапі Q-Hub з пошуком і фільтрами']
  ];


  return (
    <div className="home">
      {/* 1. перший екран */}
      <section className="h-hero">
        <div className="h-hero-txt">
          <span className="h-pill"><span className="mdot" aria-hidden="true" />Хаб гравців Quant RP</span>
          <h1>Усе для Quant RP — <span className="h-acc">прямо поверх гри</span></h1>
          <SitePromo />
          <p className="h-lead">Мапа штату й ціни скупників від гравців — просто на сайті, а мапу можна поставити й у саму гру. Програма відкриває все це за <kbd>Alt+Q</kbd>, не виходячи з GTA V.</p>
          <div className="row">
            <Link className="btn acc" to="/mapa"><Icon name="map" />Відкрити мапу</Link>
            <Link className="btn ghost" to="/programa"><Icon name="download" />Завантажити програму</Link>
            <Link className="btn ghost" to="/tsiny"><Icon name="buyer" />Дізнатися ціни</Link>
          </div>
        </div>
        <HalloweenBanner />
      </section>
      <div className="h-stats">
        {stats.map(([l, v, d]) => <div key={l} className="h-stat"><span className="h-lbl">{l}</span><b className="mono">{v}</b><small>{d}</small></div>)}
      </div>

      {/* 2. мапа */}
      <section className="h-sec" id="mapa">
        <div className="h-head">
          <span className="h-kicker"><Icon name="pin" size={16} />Мапа штату</span>
          <h2>Знайди будь-яку точку штату — на сайті чи просто в грі</h2>
          <p className="muted">Магазини, роботи, скупники, поля полювання й скарбів, зелені зони — з пошуком і фільтрами. А потрібні мітки збери в мінікарту для GTA V.</p>
        </div>
        <div className="h-split">
          <MiniMap />
          <div className="h-side">
            <div className="h-feat"><span className="ibub"><Icon name="map" /></span><div><h3>Почни писати — і мітка вже на мапі</h3><p className="muted">Набери «24/7» чи «риболовля» — мапа покаже всі збіги. Повна мапа — з фільтрами груп, полями й зонами.</p></div></div>
            <div className="h-feat"><span className="ibub"><Icon name="layers" /></span><div><h3>Ті самі мітки — на мінікарті в грі</h3><p className="muted">Галочками вибираєш назви, зони й мітки — сайт збирає файли мінікарти, а ти ставиш їх через OpenIV.</p></div></div>
            <GameMapTile />
          </div>
        </div>
      </section>

      {/* 3. програма */}
      <section className="h-sec">
        <div className="h-head row between">
          <div>
            <span className="h-kicker"><Icon name="bolt" size={16} />Програма для Windows</span>
            <h2>Уся програма — в одній плашці Alt+Q</h2>
            <p className="muted">Кабінет, склад, гараж, облік і угоди відкриваються поверх GTA V — гру згортати не треба.</p>
          </div>
          <div className="h-hotkey"><img src="/brand/q-hub-logo.svg?v=2" alt="" width={40} height={40} /><span className="h-lbl">Виклик у грі</span><span><kbd>Alt</kbd> + <kbd>Q</kbd></span></div>
        </div>
        <div className="h-pillars">
          <div className="card h-pillar"><span className="ibub"><Icon name="chart" /></span><span className="h-lbl">Облік</span><h3>Угода — одним рядком</h3><p className="muted">Напиши, що зробив, — програма покаже запис і збереже його лише після Enter. Готівку й картку вона бачить у HUD гри сама.</p><div className="h-ex mono"><span>Alt+Q</span><b>«продав 5 руди за 9к»</b></div></div>
          <div className="card h-pillar"><span className="ibub"><Icon name="camera" /></span><span className="h-lbl">Ціни скупників</span><h3>Відкрив скупника — ціна вже на сайті</h3><p className="muted">Ціни з вікна скупника йдуть у спільну базу від твого імені, з тими самими перевірками, що й ручне внесення.</p><div className="h-ex mono"><span>Хто вносить ціни</span><b>Гравці, а не адміни</b></div></div>
          {/* 50 — як AI_DAY у src/desktop/Settings.tsx і 0027_assistant_limit_50.sql */}
          <div className="card h-pillar"><span className="ibub"><Icon name="spark" /></span><span className="h-lbl">Правила й помічник</span><h3>Правила сервера — під рукою</h3><p className="muted">Enter шукає в правилах сервера, Shift+Enter питає ШІ-помічника. 50 питань на день, ліміт оновлюється опівночі за Києвом.</p><div className="h-ex mono"><span>Alt+Q</span><b>«зелена зона»</b></div></div>
        </div>
        <div className="h-strip">
          <img src="/brand/q-hub-logo.svg?v=2" alt="" width={44} height={44} />
          <div><h3>Безкоштовно · Windows 10/11 · оновлюється сама</h3><p className="muted">Не читає пам'ять гри й нічого в ній не натискає — лише знімки екрана, як OBS.</p></div>
          <Link className="btn acc" to="/programa"><Icon name="download" />Завантажити програму</Link>
        </div>
      </section>

      {/* 4. івенти й свіжі ціни */}
      <section className="grid two">
        <EventsBlock />
        <div className="card">
          <div className="row between"><h2 className="ih"><Icon name="buyer" />Знай ціну до того, як прийдеш до скупника</h2><Link className="h-more" to="/tsiny">Відкрити всі ціни →</Link></div>
          <div className="list">
            {!snap && <p className="empty">Завантажуємо ціни…</p>}
            {fresh.map(r => (
              <div key={r.buyer_id + r.item_id} className="li h-q">
                <span className="h-q-l">{r.items.image_url ? <img className="pic" src={r.items.image_url} alt="" width={36} height={36} loading="lazy" /> : <span className="pic none" style={{ width: 36, height: 36 }}>?</span>}
                  <span><b>{r.items.name}</b><small>{buyerName(r.buyer_id)}</small></span></span>
                <span className="h-q-r"><b className="mono">{money(r.price!)}<small> / {r.items.unit}</small></b><small>{ago(r.price_at!)}</small></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. що вміє */}
      <section className="h-sec">
        <div className="h-head"><h2 className="ih"><Icon name="star" />Що ще вміє Q-Hub</h2></div>
        <div className="h-cards">
          <div className="card"><span className="ibub"><Icon name="tag" /></span><h3>Кому продати дорожче</h3><p className="muted">Набери «руда» — побачиш ціну в кожного скупника й де здати вигідніше. <Link to="/tsiny">Дізнатися ціни</Link></p></div>
          <div className="card"><span className="ibub"><Icon name="box" /></span><h3>Облік, що рахує сам</h3><p className="muted">Купив, продав, нафармив — Q-Hub рахує собівартість, прибуток і що лежить на складі. <Link to="/kabinet">Відкрити кабінет</Link></p></div>
          <div className="card"><span className="ibub"><Icon name="car" /></span><h3>Скільки коштує машина</h3><p className="muted">Державна й ринкова вартість кожного авто й човна штату — з фото з гри. <Link to="/wiki/transport">Переглянути транспорт</Link></p></div>
          <div className="card"><span className="ibub"><Icon name="jobs" /></span><h3>Де заробити</h3><p className="muted">Усі роботи з рівнем, оплатою й точкою на мапі. <Link to="/wiki/roboty">Переглянути роботи</Link></p></div>
          <div className="card"><span className="ibub"><Icon name="shield" /></span><h3>Правила сервера в Alt+Q</h3><p className="muted">Набери «зелена зона» — програма знайде пункт правил, не виходячи з гри. <Link to="/programa">Завантажити програму</Link></p></div>
          <div className="card"><span className="ibub"><Icon name="clock" /></span><h3>Івенти й промокоди</h3><p className="muted">Сезонні івенти й діючі промокоди сервера — з датами, просто на головній. <a href="#iventy">Переглянути івенти</a></p></div>
        </div>
      </section>

      {/* 6. як почати */}
      <section className="start">
        <h2 className="ih"><Icon name="shield" />Як почати грати на QuantRP</h2>
        <ol className="start-grid">
          <li className="card start-card">
            <span className="start-n" aria-hidden="true">1</span>
            <h3>Придбай гру з останнім патчем</h3>
            <p className="muted">Потрібна ліцензійна Grand Theft Auto V від Rockstar з офіційних магазинів: Steam, Epic Games або Social Club.</p>
            <div className="start-foot">
              <a className="btn acc" href="https://store.steampowered.com/app/271590/Grand_Theft_Auto_V_Legacy/" target="_blank" rel="noopener noreferrer"><Icon name="tag" />Купити гру<span className="vh"> у Steam (відкриється в новій вкладці)</span></a>
            </div>
          </li>
          <li className="card start-card">
            <span className="start-n" aria-hidden="true">2</span>
            <h3>Встанови лаунчер QuantRP</h3>
            <p className="muted">Завантаж і встанови офіційний лаунчер проєкту — через нього заходиш на сервер.</p>
            <div className="start-foot">
              <a className="btn acc" href="https://quant5.com.ua/quant-install.exe" download><Icon name="download" />Завантажити лаунчер<span className="vh"> QuantRP (.exe)</span></a>
            </div>
          </li>
          <li className="card start-card">
            <span className="start-n" aria-hidden="true">3</span>
            <h3>Розпочни гру й підключи Q-Hub</h3>
            <p className="muted">Отримай оновлення в лаунчері й заходь на <b>Quant RP — GTA V</b>. А тут увійди через Discord і додай персонажа в кабінеті.</p>
            <div className="start-foot">
              {session ? <Link className="btn acc" to="/kabinet"><Icon name="user" />Відкрити кабінет</Link> : <button className="btn acc" onClick={signIn}><Icon name="user" />Увійти через Discord</button>}
            </div>
          </li>
        </ol>
      </section>
    </div>
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
      <span className="h-lbl"><span className="mdot good" aria-hidden="true" />Збирається на сайті · .zip</span>
      <div className="h-dl-body">
        <span className="h-dl-map" style={{ width: THUMB_W, height: 13500 * Z0 * THUMB_K, background: recolor(OCEAN, theme) }}>
          <img src={mapUrl(theme === 'light' ? '/map/light/0/0/0.webp' : '/map/0/0/0.webp')} alt={`Мапа для гри — ${theme === 'light' ? 'світла' : 'темна'} тема`} loading="lazy"
            style={{ width: 256 * THUMB_K, left: -(-4140 + 5996) * Z0 * THUMB_K, top: -(8470 - 8400) * Z0 * THUMB_K }} />
        </span>
        <div className="h-dl-txt">
          <h3>Мапа для Quant RP</h3>
          <div className="mseg" role="radiogroup" aria-label="Тема мапи для гри">
            <button type="button" role="radio" aria-checked={theme === 'dark'} onClick={() => setTheme('dark')}>Темна</button>
            <button type="button" role="radio" aria-checked={theme === 'light'} onClick={() => setTheme('light')}>Світла</button>
          </div>
          <ol className="h-dl-steps">
            <li>Вибери мітки — перегляд одразу покаже, що буде на мінікарті</li>
            <li>Скачай архів .zip</li>
            <li>Постав через OpenIV — <Link to="/mapa/v-gru">інструкція</Link></li>
          </ol>
        </div>
      </div>
      <div className="row">
        <Link className="btn acc" to="/mapa?game=1"><Icon name="download" />Зібрати мапу для гри</Link>
        <Link className="btn ghost" to="/mapa">Відкрити мапу</Link>
      </div>
    </div>
  );
}
