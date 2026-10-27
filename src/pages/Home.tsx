import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EventsBlock from '../components/EventsBlock';
import MiniMap from '../components/MiniMap';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import { JOBS } from '../data/jobs';
import Icon from '../components/Icon';

/* головна за макетом Stitch (design/stitch/home.html). Усі цифри справжні: зі знімка цін (public/snapshot) і даних сайту.
   Вигадані блоки макета (кількість гравців, «радар-мод», ШІ-рекомендації з відсотками) не перенесено */
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
  const stats: [string, string, string][] = [
    ['Скупників', snap ? String(snap.buyers.length) : '—', 'з цінами, які вносять гравці'],
    ['Товарів', snap ? String(snap.rows.length) : '—', 'з актуальною ціною скупника'],
    ['Оновлень цін', snap ? (snap.ups.length >= 500 ? '500+' : String(snap.ups.length)) : '—', 'від гравців за останній час'],
    ['Робіт', String(JOBS.length), 'у довіднику з описом і точкою на мапі']
  ];

  return (
    <div className="home">
      {/* 1. перший екран */}
      <section className="h-hero">
        <div className="h-hero-txt">
          <span className="h-pill"><span className="mdot" aria-hidden="true" />Головний хаб гравців Quant RP</span>
          <h1>Ціни, угоди й гроші персонажа — <span className="h-acc">в одному місці</span></h1>
          <p className="h-lead">Мапа штату з мітками, яку можна поставити прямо в гру. Програма поверх GTA V: облік з екрана і пошук ціни за <kbd>Alt+Q</kbd>. Ціни скупників, які перевіряють самі гравці, і особистий облік, склад та гараж.</p>
          <div className="row">
            <Link className="btn acc" to="/mapa"><Icon name="map" />Відкрити мапу</Link>
            <Link className="btn ghost" to="/programa"><Icon name="download" />Програма поверх гри</Link>
            <Link className="btn ghost" to="/tsiny"><Icon name="buyer" />Ціни скупників</Link>
          </div>
        </div>
        <Link className="h-promo" to="/mapa?show=pryvydy">
          <img src="/promo/ghost-tile.webp" alt="" width="700" height="380" fetchPriority="high" />
          <span className="h-promo-body">
            <span className="h-promo-tag">Сезонний івент</span>
            <b>Карта привидів уже тут</b>
            <span>Швидко знаходь усіх привидів осіннього оновлення Quant RP.</span>
            <span className="h-promo-go">Відкрити мапу →</span>
          </span>
        </Link>
      </section>
      <div className="h-stats">
        {stats.map(([l, v, d]) => <div key={l} className="h-stat"><span className="h-lbl">{l}</span><b className="mono">{v}</b><small>{d}</small></div>)}
      </div>

      {/* 2. мапа */}
      <section className="h-sec" id="mapa">
        <div className="h-head">
          <span className="h-kicker"><Icon name="pin" size={16} />Мапа штату</span>
          <h2>Інтерактивна мапа штату — і та сама мапа прямо в GTA V</h2>
          <p className="muted">Шукай магазини, банди, роботи, графіті й НЛО на сайті або збери свою мінікарту для гри — без перемикання в браузер.</p>
        </div>
        <div className="h-split">
          <MiniMap />
          <div className="h-side">
            <div className="h-feat"><span className="ibub"><Icon name="map" /></span><div><h3>Мітки з пошуком</h3><p className="muted">Почни писати назву — мітки з'являться на мапі. Або вибери групу над мапою. Повна мапа — з фільтрами й зонами.</p></div></div>
            <div className="h-feat"><span className="ibub"><Icon name="layers" /></span><div><h3>Мітки прямо в грі</h3><p className="muted">Галочками вибираєш назви, зелені зони й мітки — сайт збирає файли мінікарти для заміни через OpenIV.</p></div></div>
            <div className="h-dl">
              <span className="h-lbl"><span className="mdot good" aria-hidden="true" />Збирається на сайті · .zip</span>
              <h3>Мапа для Quant RP</h3>
              <p className="muted">Вибери, що показувати, і завантаж архів для папки гри.</p>
              <div className="row">
                <Link className="btn acc" to="/mapa?game=1"><Icon name="download" />Зібрати мапу для гри</Link>
                <Link className="btn ghost" to="/mapa">Відкрити мапу</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. програма */}
      <section className="h-sec">
        <div className="h-head row between">
          <div>
            <span className="h-kicker"><Icon name="bolt" size={16} />Програма для Windows</span>
            <h2>Q-Hub поверх гри</h2>
            <p className="muted">Легка програма, яка відкривається поверх GTA V за <kbd>Alt+Q</kbd> і веде облік за тебе.</p>
          </div>
          <div className="h-hotkey"><img src="/brand/q-hub-logo.svg" alt="" width={40} height={40} /><span className="h-lbl">Виклик у грі</span><span><kbd>Alt</kbd> + <kbd>Q</kbd></span></div>
        </div>
        <div className="h-pillars">
          <div className="card h-pillar"><span className="ibub"><Icon name="chart" /></span><span className="h-lbl">Облік</span><h3>Гроші з екрана — одразу в облік</h3><p className="muted">Програма бачить готівку й картку в HUD гри і пропонує записати зміну разом з місцем.</p><div className="h-ex mono"><span>Приклад запису</span><b>−1000 $ · Магазин 24/7</b></div></div>
          <div className="card h-pillar"><span className="ibub"><Icon name="camera" /></span><span className="h-lbl">Ціни скупників</span><h3>Відкрив вікно скупника — ціни на сайті</h3><p className="muted">Ціни з вікна скупника йдуть у спільну базу від твого імені, з тими самими перевірками, що й ручне внесення.</p><div className="h-ex mono"><span>Хто вносить ціни</span><b>Гравці, а не адміни</b></div></div>
          <div className="card h-pillar"><span className="ibub"><Icon name="spark" /></span><span className="h-lbl">Помічник</span><h3>Пиши своїми словами</h3><p className="muted">«Продав 10 гливи», «що вигідно здати?», «видали останній запис» — помічник показує, що запише, і пише лише після Enter.</p><div className="h-ex mono"><span>Alt+Q</span><b>«що вигідно здати?»</b></div></div>
        </div>
        <div className="h-strip">
          <img src="/brand/q-hub-logo.svg" alt="" width={44} height={44} />
          <div><h3>Тестова версія для Windows 10/11</h3><p className="muted">Не читає пам'ять гри й нічого в ній не натискає — лише знімки екрана, як OBS.</p></div>
          <Link className="btn acc" to="/programa"><Icon name="download" />Завантажити програму</Link>
        </div>
      </section>

      {/* 4. івенти й свіжі ціни */}
      <section className="grid two">
        <EventsBlock />
        <div className="card">
          <div className="row between"><h2 className="ih"><Icon name="buyer" />Свіжі ціни скупників</h2><Link className="h-more" to="/tsiny">Вся таблиця →</Link></div>
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
        <div className="h-head"><h2 className="ih"><Icon name="star" />Що вміє Q-Hub</h2></div>
        <div className="h-cards">
          <div className="card"><span className="ibub"><Icon name="tag" /></span><h3>Скільки дати гравцю</h3><p className="muted">Пишеш товар — бачиш, за скільки його брати і кому продати дорожче.</p></div>
          <div className="card"><span className="ibub"><Icon name="box" /></span><h3>Облік і склад</h3><p className="muted">Купив, продав, нафармив — Q-Hub рахує собівартість, прибуток і баланс.</p></div>
          <div className="card"><span className="ibub"><Icon name="car" /></span><h3>Гараж і транспорт</h3><p className="muted">Авто, тюнінг, державна й ринкова вартість кожної машини штату.</p></div>
          <div className="card"><span className="ibub"><Icon name="jobs" /></span><h3>Довідник робіт</h3><p className="muted">Усі роботи з рівнем, оплатою і точкою на мапі — <Link to="/wiki/roboty">дивитися</Link>.</p></div>
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
