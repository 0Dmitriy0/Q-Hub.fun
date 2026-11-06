import { useState } from 'react';
import Icon from '../components/Icon';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { FAMILY, useDiscord } from '../lib/brand';
import DiscordForm from '../components/DiscordForm';
import { CHANGES, GROUPS, dayOf } from '../lib/changelog';
import { Link } from 'react-router-dom';
import HotkeysTable from '../components/HotkeysTable';

/* Сторінка «Програма»: завантаження Q-Hub Desktop. Інсталятор збирає GitHub Actions (.github/workflows/desktop.yml)
   і викладає в реліз «desktop-latest» — посилання завжди веде на останню збірку з main.
   Вигляд — за макетом Stitch (design/stitch/programs.html); вигадані цифри макета (версії, мс, % CPU) не перенесено */
const SETUP = 'https://github.com/0Dmitriy0/Q-Hub.fun/releases/download/desktop-latest/Q-Hub-Setup.exe';
const LOG_FEW = 3;   // скільки оновлень видно без «Показати всі»
/* лічильник «Завантажень програми» на головній (specs/011, 0032): +1 за клік; сторінка лишається відкритою, тож запит встигає */
const countDownload = () => { supabase?.rpc('count_download').then(() => { /* без бази — просто не рахуємо */ }); };

/* демо рядка Alt+Q: що плашка показала б на запит (приклади, не справжні дані) */
const DEMO = [
  { text: 'глива', sum: '1 500 $/шт', what: 'Скупник «Гриби» · межі 900–1 800 $', good: true },
  { text: 'вимагання грошей', sum: 'КК ст. 6.5', what: 'Кримінальний кодекс — пункт і покарання з форуму', good: true },
  { text: 'де заправка?', sum: 'Мапа', what: 'Найближчі заправки на мапі Q-Hub поверх гри', good: true }
];

const FEATURES: [string, string, string][] = [
  ['spark', 'Alt+Q — рядок поверх гри', 'Пошук у правилах сервера, законах штату й на мапі без ШІ, а Shift+Enter — питання ШІ-помічнику своїми словами.'],
  ['buyer', 'Ціни скупників з іконками й межами', 'Миттєвий пошук ціни без ШІ: риба, ферма, руди, метали — одним запитом.'],
  ['camera', 'Ціни з вікна скупника', 'Відкрив вікно скупника — ціни й час наступної зміни цін йдуть на сайт від твого імені, з тими самими перевірками, що й ручне внесення.'],
  ['clock', 'Прибуток за годину сеансу', 'Програма бачить готівку й картку в HUD і показує, скільки в середньому заробляєш за годину гри — видно, що фармити вигідніше. Нікуди не записує.'],
  ['map', 'Мапа Q-Hub поверх гри', 'Alt+M — мапа з мітками, полями й зонами просто в грі; «Де я?» з відкритою великою картою.']
];

const FAQ: [string, string][] = [
  ['Чому Windows лається на файл?', 'Інсталятор ще не підписаний сертифікатом розробника, тому SmartScreen його не знає. Натисни «Докладніше» → «Виконати все одно».'],
  ['Чи бачить програма щось, крім мого екрана?', 'Ні. Вона робить знімки твого екрана (як OBS), не читає пам\'ять гри й нічого в ній не натискає.'],
  ['Програма внесла неправильну ціну — що робити?', 'Ціна стає поточною лише тоді, коли ту саму внесе ще один гравець. Якщо щось не так — напиши в Discord Q-Hub, адмін перевірить.']
];

export default function Download() {
  const [d, setD] = useState(0);
  const demo = DEMO[d];
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [discord, reloadDiscord] = useDiscord();
  const [editLink, setEditLink] = useState(false);
  const [logAll, setLogAll] = useState(false);
  return (
    <div className="prog">
      {/* 1. перший екран */}
      <section className="p-hero">
        <div className="p-hero-top">
          <span className="h-pill"><span className="mdot good" aria-hidden="true" />Q-Hub Desktop · Windows 10 / 11 (x64)</span>
          <span className="p-badge">Тестова збірка</span>
        </div>
        <h1>Програма поверх гри</h1>
        <p className="h-lead">Ціни скупників, правила сервера, мапа й ШІ-помічник поверх гри. <kbd>Alt+Q</kbd> відкриває рядок: знайди ціну товару, пункт правил чи місце на мапі. Програма рахує ігрову сесію й показує, скільки заробляєш за годину.</p>
        <div className="p-warn" role="note">
          <span className="p-warn-ico" aria-hidden="true">!</span>
          <div><b>Тестова версія — ще не фінальний результат</b><span>Можуть траплятися помилки, а вигляд і можливості ще змінюватимуться.</span></div>
        </div>
        <div className="row">
          <a className="btn acc" href={SETUP} onClick={countDownload}><Icon name="download" />Завантажити для Windows</a>
          <Link className="btn ghost" to="/programa/instruktsiya"><Icon name="book" />Інструкція</Link>
          <a className="btn ghost" href="#onovlennya" onClick={() => setLogAll(false)}><Icon name="history" />Що нового в збірці</a>
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
            <div className="p-prompt-h"><span><kbd>Alt+Q</kbd> Плашка Q-Hub</span><span className="p-ready"><span className="mdot good" aria-hidden="true" />Готовий</span></div>
            <form className="p-prompt-in" onSubmit={e => { e.preventDefault(); setD((d + 1) % DEMO.length); }}>
              <Icon name="search" />
              <input value={demo.text} readOnly aria-label="Приклад запиту до помічника" />
              <button type="submit" className="btn acc sm">Enter</button>
            </form>
            <div className="p-prompt-out">
              <span className="h-lbl">Плашка покаже:</span>
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

      {/* 3а. комбінації клавіш — той самий список, що в програмі (кнопка «?» у плашці), src/lib/hotkeys.ts */}
      <section className="h-sec" id="klavishi">
        <div className="h-head"><span className="h-kicker"><Icon name="help" size={16} />Інструкція</span><h2>Комбінації клавіш</h2></div>
        <HotkeysTable />
        <p className="muted p-keys-note">Це типові клавіші. Alt+Q, Alt+M і Alt+F9 можна перепризначити в програмі: шестірня в плашці → «Основне» чи «Зір програми». Список у будь-який момент — кнопка <b>?</b> поруч із шестірнею. Як користуватися програмою крок за кроком — <Link to="/programa/instruktsiya">інструкція</Link>.</p>
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

      {/* 5. журнал оновлень — той самий, що в програмі (Налаштування → Журнал оновлень), а не сторінка релізу на GitHub */}
      <section className="h-sec" id="onovlennya">
        <div className="h-head"><span className="h-kicker"><Icon name="history" size={16} />Журнал оновлень</span><h2>Що нового в програмі</h2></div>
        <div className="p-log">
          {CHANGES.slice(0, logAll ? CHANGES.length : LOG_FEW).map((e, i) => (
            <article key={e.id} className="card p-log-e">
              <header><h3>{e.title}</h3><small className="muted">{e.version ? `v${e.version} · ` : ''}{dayOf(e.id)}</small>{i === 0 && <span className="pill good">найновіше</span>}</header>
              {GROUPS.map(([k, l, tone]) => e[k]?.length ? <div key={k} className={'p-log-g ' + tone}><h4>{l}</h4><ul>{e[k]!.map(t => <li key={t}>{t}</li>)}</ul></div> : null)}
            </article>))}
        </div>
        {CHANGES.length > LOG_FEW && <button type="button" className="btn ghost p-log-more" aria-expanded={logAll} onClick={() => setLogAll(a => !a)}>{logAll ? 'Згорнути' : `Показати всі оновлення (${CHANGES.length})`}</button>}
      </section>

      {/* 6. питання й зворотний зв'язок */}
      <section className="p-bottom">
        <div className="card">
          <h2 className="ih"><Icon name="star" />Часті запитання</h2>
          <div className="p-faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p className="muted">{a}</p></details>)}
          </div>
        </div>
        {/* помилки й ідеї — лише в Discord Q-Hub (рішення власника 2026-11-01: без GitHub); без посилання блок бачить лише адмін */}
        {(discord || isAdmin) && <div className="card p-help">
          <span className="ibub"><Icon name="spark" /></span>
          <h3>Знайшли помилку чи маєте ідею?</h3>
          <p className="muted">Напиши в Discord, що сталося і що ти робив перед цим — так помилку виправити найшвидше.</p>
          {discord && <a className="btn acc" href={discord} target="_blank" rel="noreferrer">Написати в Discord Q-Hub<span className="vh"> (відкриється в новій вкладці)</span></a>}
          {isAdmin && (editLink ? <DiscordForm url={discord} done={() => { setEditLink(false); reloadDiscord(); }} />
            : <button type="button" className="btn ghost sm" onClick={() => setEditLink(true)}>{discord ? 'Змінити посилання Discord' : 'Додати посилання Discord'}</button>)}
        </div>}
      </section>
      <p className="muted p-by">Програму робить сім'я {FAMILY} на QuantRP.</p>
    </div>
  );
}
