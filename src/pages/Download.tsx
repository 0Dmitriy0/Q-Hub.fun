import { useState } from 'react';
import Icon from '../components/Icon';

/* Сторінка «Програма»: завантаження Q-Hub Desktop. Інсталятор збирає GitHub Actions (.github/workflows/desktop.yml)
   і викладає в реліз «desktop-latest» — посилання завжди веде на останню збірку з main.
   Вигляд — за макетом Stitch (design/stitch/programs.html); вигадані цифри макета (версії, мс, % CPU) не перенесено */
const SETUP = 'https://github.com/0Dmitriy0/Q-Hub.fun/releases/download/desktop-latest/Q-Hub-Setup.exe';
const RELEASE = 'https://github.com/0Dmitriy0/Q-Hub.fun/releases/tag/desktop-latest';
const ISSUES = 'https://github.com/0Dmitriy0/Q-Hub.fun/issues';

/* демо рядка Alt+Q: що помічник показав би перед записом (приклади, не справжні дані) */
const DEMO = [
  { text: 'продав 10 гливи по 1500', sum: '+15 000 $', what: 'Продаж «Глива», 10 шт.', good: true },
  { text: 'купив ремкомплект 2500', sum: '−2 500 $', what: 'Витрата «Ремкомплект», 1 шт.', good: false },
  { text: 'що вигідно здати?', sum: 'Порада', what: 'Скупник з найвищою ціною на те, що є на складі', good: true }
];

const FEATURES: [string, string, string][] = [
  ['spark', 'Alt+Q — рядок поверх гри', '«Продав 10 гливи», «що вигідно здати?», «видали останній запис». Помічник показує, що запише, і пише лише після Enter.'],
  ['buyer', 'Ціни скупників з іконками й межами', 'Миттєвий пошук ціни без ШІ: риба, ферма, руди, метали — одним запитом.'],
  ['coin', 'Готівка й картка окремо', 'Гроші з HUD гри потрапляють в облік разом з місцем: «−1000 $ · Магазин 24/7».'],
  ['camera', 'Ціни з вікна скупника', 'Відкрив вікно скупника — ціни йдуть на сайт від твого імені, з тими самими перевірками, що й ручне внесення.'],
  ['clock', 'Таймер ігрової сесії', 'Скільки відіграно й скільки заробляєш за годину гри — видно, що фармити вигідніше.'],
  ['box', 'Облік, склад і гараж', 'Ті самі дані, що в кабінеті на сайті: записи, залишки складу й машини персонажа.']
];

const FAQ: [string, string][] = [
  ['Чому Windows лається на файл?', 'Інсталятор ще не підписаний сертифікатом розробника, тому SmartScreen його не знає. Натисни «Докладніше» → «Виконати все одно».'],
  ['Чи бачить програма щось, крім мого екрана?', 'Ні. Вона робить знімки твого екрана (як OBS), не читає пам\'ять гри й нічого в ній не натискає.'],
  ['Програма записала щось не так — що робити?', 'Записи, які програма зробила сама, мають позначку «Авто ·». Перевір їх у кабінеті на сайті й виправ або видали.']
];

export default function Download() {
  const [d, setD] = useState(0);
  const demo = DEMO[d];
  return (
    <div className="prog">
      {/* 1. перший екран */}
      <section className="p-hero">
        <div className="p-hero-top">
          <span className="h-pill"><span className="mdot good" aria-hidden="true" />Q-Hub Desktop · Windows 10 / 11 (x64)</span>
          <span className="p-badge">Тестова збірка</span>
        </div>
        <h1>Програма поверх гри</h1>
        <p className="h-lead">Облік, склад, гараж і ціни скупників в окремій програмі. <kbd>Alt+Q</kbd> відкриває рядок поверх гри: запиши, що сталося, своїми словами або знайди ціну товару. Програма сама рахує ігрові сесії й бачить готівку та банк у HUD.</p>
        <div className="p-warn" role="note">
          <span className="p-warn-ico" aria-hidden="true">!</span>
          <div><b>Тестова версія — ще не фінальний результат</b><span>Можуть траплятися помилки, а вигляд і можливості ще змінюватимуться. Записи, які програма робить сама (з позначкою «Авто ·»), перевіряй у кабінеті.</span></div>
        </div>
        <div className="row">
          <a className="btn acc" href={SETUP}><Icon name="download" />Завантажити для Windows</a>
          <a className="btn ghost" href={RELEASE} target="_blank" rel="noreferrer"><Icon name="history" />Що нового в збірці<span className="vh"> (відкриється в новій вкладці)</span></a>
        </div>
        <small className="p-sign"><Icon name="shield" size={16} />Інсталятор ще не підписаний сертифікатом: Windows покаже «Захистив ваш ПК» → «Докладніше» → «Виконати все одно».</small>
      </section>

      {/* 2. як це виглядає в грі — демо */}
      <section className="h-sec">
        <div className="h-head row between">
          <div><span className="h-kicker"><Icon name="bolt" size={16} />Демо</span><h2>Як виглядає рядок Alt+Q у грі</h2></div>
        </div>
        <div className="p-screen">
          <div className="p-prompt">
            <div className="p-prompt-h"><span><kbd>Alt+Q</kbd> Помічник Q-Hub</span><span className="p-ready"><span className="mdot good" aria-hidden="true" />Готовий</span></div>
            <form className="p-prompt-in" onSubmit={e => { e.preventDefault(); setD((d + 1) % DEMO.length); }}>
              <Icon name="search" />
              <input value={demo.text} readOnly aria-label="Приклад запиту до помічника" />
              <button type="submit" className="btn acc sm">Enter</button>
            </form>
            <div className="p-prompt-out">
              <span className="h-lbl">Помічник запише:</span>
              <b className={'mono ' + (demo.good ? 'good' : 'bad')}>{demo.sum}</b>
              <span>{demo.what}</span>
            </div>
          </div>
          <div className="p-hud-bot mono"><span><Icon name="clock" size={14} />Сесія: 02:45</span><span>Режим гри: вікно без рамки</span></div>
        </div>
      </section>

      {/* 3. можливості */}
      <section className="h-sec">
        <div className="h-head"><span className="h-kicker"><Icon name="bolt" size={16} />Можливості</span><h2>Що вміє Q-Hub Desktop</h2></div>
        <div className="p-feats">
          {FEATURES.map(([ico, t, p]) => <div key={t} className="card"><span className="ibub"><Icon name={ico} /></span><h3>{t}</h3><p className="muted">{p}</p></div>)}
        </div>
      </section>

      {/* 4. вимоги */}
      <section className="h-sec">
        <div className="h-head"><span className="h-kicker"><Icon name="gear" size={16} />Вимоги</span><h2>Що потрібно для запуску</h2></div>
        <div className="p-req">
          <div className="card"><span className="start-n p-n" aria-hidden="true">1</span><h3>Вікно без рамки</h3><p className="muted">Windows 10 або 11. GTA V — у режимі <b>«Вікно без рамки»</b>: у повноекранному режимі програма не бачить HUD.</p></div>
          <div className="card"><span className="start-n p-n" aria-hidden="true">2</span><h3>Акаунт Q-Hub</h3><p className="muted">Вхід через <b>Discord</b> і персонаж у кабінеті — щоб записи потрапляли куди треба.</p></div>
          <div className="card p-safe"><span className="start-n p-n" aria-hidden="true"><Icon name="shield" size={18} /></span><h3>Не лізе в гру</h3><p className="muted">Програма <b>не читає пам'ять гри</b> й нічого в ній не натискає — лише знімки екрана, як OBS.</p></div>
        </div>
      </section>

      {/* 5. питання й зворотний зв'язок */}
      <section className="p-bottom">
        <div className="card">
          <h2 className="ih"><Icon name="star" />Часті запитання</h2>
          <div className="p-faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p className="muted">{a}</p></details>)}
          </div>
        </div>
        <div className="card p-help">
          <span className="ibub"><Icon name="spark" /></span>
          <h3>Знайшли помилку чи маєте ідею?</h3>
          <p className="muted">Напиши, що сталося і що ти робив перед цим — так помилку виправити найшвидше.</p>
          <a className="btn ghost" href={ISSUES} target="_blank" rel="noreferrer">Повідомити на GitHub<span className="vh"> (відкриється в новій вкладці)</span></a>
        </div>
      </section>
    </div>
  );
}
