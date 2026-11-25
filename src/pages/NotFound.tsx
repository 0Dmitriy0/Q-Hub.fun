import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

/* Сервер на будь-яку адресу віддає оболонку сайту з кодом 200 (маршрути — у застосунку), тож неіснуючу сторінку
   пошуковик вважав би справжньою. Позначка noindex каже йому не індексувати її; з виходом зі сторінки прибирається */
export default function NotFound() {
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);
  return (
    <section className="nf">
      <b className="nf-code" aria-hidden="true">404</b>
      <div className="nf-txt">
        <h1>Такої сторінки немає</h1>
        <p className="muted">Посилання застаріло або в адресі помилка. Найчастіше шукають ось це:</p>
        <div className="row">
          <Link className="btn acc" to="/tsiny"><Icon name="buyer" />Ціни скупників</Link>
          <Link className="btn" to="/mapa"><Icon name="map" />Мапа штату</Link>
          <Link className="btn ghost" to="/">На головну</Link>
        </div>
      </div>
    </section>
  );
}
