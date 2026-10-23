/* Сторінка «Програма»: завантаження Q-Hub Desktop. Інсталятор збирає GitHub Actions (.github/workflows/desktop.yml)
   і викладає в реліз «desktop-latest» — посилання завжди веде на останню збірку з main */
const SETUP = 'https://github.com/0Dmitriy0/Q-Hub.fun/releases/download/desktop-latest/Q-Hub-Setup.exe';
const RELEASE = 'https://github.com/0Dmitriy0/Q-Hub.fun/releases/tag/desktop-latest';

export default function Download() {
  return (
    <>
      <section className="card hero">
        <span className="lbl">Q-Hub Desktop · Windows</span>
        <h1>Програма поверх гри</h1>
        <p className="muted">Облік, склад, гараж і ціни скупників у окремій програмі. Alt+Q відкриває рядок поверх гри: запиши, що сталося, своїми словами або знайди ціну товару. Програма сама рахує ігрові сесії й бачить готівку та банк у HUD.</p>
        <div className="note-test" role="note">
          <b>Тестова версія — ще не фінальний результат.</b>
          <span>Програма зараз проходить тести: можуть траплятися помилки, а вигляд і можливості ще змінюватимуться. Записи, які вона робить сама (з позначкою «Авто ·»), перевіряй у кабінеті.</span>
        </div>
        <div className="row">
          <a className="btn acc" href={SETUP}>Завантажити для Windows</a>
          <a className="btn ghost" href={RELEASE} target="_blank" rel="noreferrer">Що нового в збірці</a>
        </div>
        <small className="muted">Інсталятор ще не підписаний сертифікатом: Windows покаже «Захистив ваш ПК» → «Докладніше» → «Виконати все одно».</small>
      </section>
      <section className="card">
        <h2>Що вміє</h2>
        <ul className="steps plain">
          <li><span><b>Alt+Q</b> — рядок поверх гри: «продав 10 гливи», «що вигідно здати?», «видали останній запис». Помічник показує, що запише, і пише лише після Enter.</span></li>
          <li><span>Ціни скупників з іконками й межами — миттєвий пошук без ШІ.</span></li>
          <li><span>Готівка й картка окремо; гроші з HUD гри потрапляють в облік разом з місцем: «−1000 $ · Магазин 24/7».</span></li>
          <li><span>Відкрив вікно скупника — ціни йдуть на сайт від твого імені, з тими самими перевірками, що й ручне внесення.</span></li>
          <li><span>Таймер ігрової сесії: скільки відіграно й скільки заробляєш за годину гри.</span></li>
        </ul>
      </section>
      <section className="card">
        <h2>Що потрібно</h2>
        <ul className="steps plain">
          <li><span>Windows 10/11, гра в режимі «Вікно без рамки» — у повноекранному режимі програма не бачить HUD.</span></li>
          <li><span>Акаунт Q-Hub (вхід через Discord) і персонаж у кабінеті.</span></li>
          <li><span>Програма не читає пам'ять гри й нічого в ній не натискає — лише знімки екрана, як OBS.</span></li>
        </ul>
      </section>
    </>
  );
}
