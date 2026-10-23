import { Link } from 'react-router-dom';
import EventList from '../components/EventList';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';

export default function Home() {
  const { session, signIn } = useAuth();
  return (
    <>
      <section className="card hero">
        <span className="lbl">Для гравців QuantRP</span>
        <h1>Ціни, угоди й гроші персонажа — в одному місці</h1>
        <p className="muted">Ціни скупників і ринку гравців, які перевіряють самі гравці. Особистий облік, склад і гараж. Програма поверх гри: пошук ціни за <b>Alt+Q</b> і баланс з екрана прямо в облік.</p>
        <div className="row">
          {session ? <Link className="btn acc" to="/kabinet"><Icon name="user" />Відкрити кабінет</Link> : <button className="btn acc" onClick={signIn}><Icon name="user" />Увійти через Discord</button>}
          <Link className="btn ghost" to="/tsiny"><Icon name="buyer" />Ціни скупників</Link>
          <Link className="btn ghost" to="/transport"><Icon name="car" />Транспорт</Link>
        </div>
      </section>
      <div className="grid side">
        <section className="card">
          <h2 className="ih"><Icon name="clock" />Найближчі івенти</h2>
          <EventList compact />
        </section>
        <section className="card">
          <h2 className="ih"><Icon name="bolt" />Що вміє Q-Hub</h2>
          <ul className="feat">
            <li><span className="ibub"><Icon name="tag" /></span><div><b>Скільки дати гравцю.</b> <span className="muted">Пишеш товар — бачиш, за скільки його брати і кому продати дорожче.</span></div></li>
            <li><span className="ibub"><Icon name="chart" /></span><div><b>Облік і склад.</b> <span className="muted">Купив, продав, нафармив — Q-Hub рахує собівартість, прибуток і баланс.</span></div></li>
            <li><span className="ibub"><Icon name="car" /></span><div><b>Гараж.</b> <span className="muted">Авто, тюнінг, держ. і ринкова вартість.</span></div></li>
            <li><span className="ibub"><Icon name="map" /></span><div><b><Link to="/mapa">Мапа штату.</Link></b> <span className="muted">Магазини, банди, роботи, графіті, НЛО й зелені зони — вмикаєш галочками лише потрібне. Можна скачати свою мінікарту для гри.</span></div></li>
            <li><span className="ibub"><Icon name="download" /></span><div><b>Програма поверх гри.</b> <span className="muted">Бачить твій баланс на екрані й пропонує записати зміну в облік.</span></div></li>
          </ul>
        </section>
      </div>
      <section className="start">
        <h2 className="ih"><Icon name="shield" />Як почати грати на QuantRP</h2>
        <ol className="start-grid">
          <li className="card start-card">
            <span className="start-n" aria-hidden="true">1</span>
            <h3>Придбай гру з останнім патчем</h3>
            <p className="muted">Потрібна ліцензійна Grand Theft Auto V від Rockstar з офіційних магазинів: Steam, Epic Games або Social Club.</p>
            <div className="start-foot">
              <a className="btn acc" href="https://store.steampowered.com/app/271590/Grand_Theft_Auto_V_Legacy/" target="_blank" rel="noopener noreferrer">Купити гру<span className="vh"> у Steam (відкриється в новій вкладці)</span></a>
              <span className="ibub big"><Icon name="tag" size={26} /></span>
            </div>
          </li>
          <li className="card start-card">
            <span className="start-n" aria-hidden="true">2</span>
            <h3>Встанови лаунчер QuantRP</h3>
            <p className="muted">Завантаж і встанови офіційний лаунчер проєкту — через нього заходиш на сервер.</p>
            <div className="start-foot">
              <a className="btn acc" href="https://quant5.com.ua/quant-install.exe" download>Завантажити<span className="vh"> лаунчер QuantRP (.exe)</span></a>
              <span className="ibub big"><Icon name="download" size={26} /></span>
            </div>
          </li>
          <li className="card start-card">
            <span className="start-n" aria-hidden="true">3</span>
            <h3>Розпочни гру</h3>
            <p className="muted">Отримай останні оновлення в лаунчері й починай гру на <b>Quant RP — GTA V</b>. А тут увійди через Discord і додай персонажа в кабінеті.</p>
            <div className="start-foot">
              <span />
              <span className="ibub big"><Icon name="bolt" size={26} /></span>
            </div>
          </li>
        </ol>
      </section>
    </>
  );
}
