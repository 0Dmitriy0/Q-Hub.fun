import { useEffect } from 'react';
import { Link } from 'react-router-dom';

/* Сервер на будь-яку адресу віддає оболонку сайту з кодом 200 (маршрути — у застосунку), тож неіснуючу сторінку
   пошуковик вважав би справжньою. Позначка noindex каже йому не індексувати її; з виходом зі сторінки прибирається */
export default function NotFound() {
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);
  return <div className="card empty"><h1>Сторінки немає</h1><p>Можливо, посилання застаріло.</p><p><Link to="/">На головну</Link></p></div>;
}
