import { Link } from 'react-router-dom';
import EventList from '../components/EventList';
import { useAuth } from '../lib/auth';

export default function Home() {
  const { session, signIn } = useAuth();
  return (
    <>
      <section className="card hero">
        <span className="lbl">Для гравців QuantRP</span>
        <h1>Ціни, угоди й гроші персонажа — в одному місці</h1>
        <p className="muted">Ціни скупників і ринку гравців, які перевіряють самі гравці. Особистий облік, склад і гараж. Програма поверх гри: пошук ціни за <b>Alt+Q</b> і баланс з екрана прямо в облік.</p>
        <div className="row">
          {session ? <Link className="btn acc" to="/kabinet">Відкрити кабінет</Link> : <button className="btn acc" onClick={signIn}>Увійти через Discord</button>}
          <Link className="btn ghost" to="/tsiny">Подивитись ціни</Link>
        </div>
      </section>
      <div className="grid side">
        <section className="card">
          <div className="row between"><h2>Найближчі івенти</h2><Link to="/iventy">усі →</Link></div>
          <EventList compact />
        </section>
        <section className="card">
          <h2>Що вміє Q-Hub</h2>
          <ul className="steps">
            <li><div><b>Скільки дати гравцю.</b> <span className="muted">Пишеш товар — бачиш, за скільки його брати і кому продати дорожче.</span></div></li>
            <li><div><b>Облік і склад.</b> <span className="muted">Купив, продав, нафармив — Q-Hub рахує собівартість, прибуток і баланс.</span></div></li>
            <li><div><b>Гараж.</b> <span className="muted">Авто, тюнінг, держ. і ринкова вартість.</span></div></li>
            <li><div><b>Програма поверх гри.</b> <span className="muted">Бачить твій баланс на екрані й пропонує записати зміну в облік.</span></div></li>
          </ul>
        </section>
      </div>
      <section className="card">
        <h2>Як почати грати на QuantRP</h2>
        <ol className="steps">
          <li><span>Потрібна ліцензійна GTA V для ПК.</span></li>
          <li><span>Встанови RAGE:MP або лаунчер QuantRP — посилання й адреса сервера на офіційних сторінках проєкту.</span></li>
          <li><span>Зайди на сервер, створи персонажа, а тут — увійди через Discord і додай його в кабінеті.</span></li>
        </ol>
      </section>
    </>
  );
}
