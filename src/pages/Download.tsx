import { useState } from 'react';
import Icon from '../components/Icon';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { FAMILY, useDiscord } from '../lib/brand';
import DiscordForm from '../components/DiscordForm';
import { CHANGES, GROUPS, dayOf } from '../lib/changelog';
import { Link } from 'react-router-dom';
import HotkeysTable from '../components/HotkeysTable';
import BarDemo, { EXAMPLES } from '../components/BarDemo';

/* Сторінка «Програма»: завантаження Q-Hub Desktop. Інсталятор збирає GitHub Actions (.github/workflows/desktop.yml)
   і викладає в реліз «desktop-latest» — посилання завжди веде на останню збірку з main.
   Вигляд — за макетом Stitch (design/stitch/programs.html); демо Alt+Q — справжня плашка програми (components/BarDemo.tsx) */
const SETUP = 'https://github.com/0Dmitriy0/Q-Hub.fun/releases/download/desktop-latest/Q-Hub-Setup.exe';
const LOG_FEW = 3;   // скільки оновлень видно без «Показати всі»
/* лічильник «Завантажень програми» на головній (specs/011, 0032): +1 за клік; сторінка лишається відкритою, тож запит встигає */
const countDownload = () => { supabase?.rpc('count_download').then(() => { /* без бази — просто не рахуємо */ }); };

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
  const [pick, setPick] = useState<{ q: string; mode: 'ai' | 'prices'; n: number }>();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [discord, reloadDiscord] = useDiscord();
  const [editLink, setEditLink] = useState(false);
  const [logAll, setLogAll] = useState(false);
  return (
    <div className="prog">
      {/* 1. перший екран */}
      <section className="p-hero">
        <p className="p-hero-top">Q-Hub Desktop для Windows 10 і 11 (x64), <b>тестова збірка</b></p>
        <h1>Програма поверх гри</h1>
        <p className="h-lead p-lead">Ціни скупників, правила сервера, мапа й ШІ-помічник — прямо поверх GTA V. Натисни <kbd>Alt+Q</kbd>, впиши, що шукаєш, і отримай відповідь, не виходячи з гри. А ще програма рахує, скільки ти заробляєш за годину.</p>
        <div className="p-warn" role="note">
          <span className="p-warn-ico" aria-hidden="true">!</span>
          <div><b>Тестова версія — ще не фінальний результат</b><span>Можуть траплятися помилки, а вигляд і можливості ще змінюватимуться.</span></div>
        </div>
        <div className="row">
          <a className="btn acc" href={SETUP} onClick={countDownload} data-umami-event="Завантажити програму" data-umami-event-where="programa"><Icon name="download" />Завантажити для Windows</a>
          <Link className="btn" to="/programa/instruktsiya"><Icon name="book" />Інструкція</Link>
          <a className="btn ghost" href="#onovlennya" onClick={() => setLogAll(false)}><Icon name="history" />Що нового в збірці</a>
        </div>
        <small className="p-sign"><Icon name="shield" size={16} />Інсталятор ще не підписаний сертифікатом: Windows покаже «Захистив ваш ПК» → «Докладніше» → «Виконати все одно».</small>
      </section>

      {/* 2. як це виглядає в грі — демо */}
      <section className="h-sec">
        <div className="h-head"><h2>Спробуй плашку Alt+Q прямо тут</h2></div>
        <p className="muted p-bar-lead">Та сама плашка, що в програмі: впиши запит і натисни <kbd>Enter</kbd> або обери приклад нижче. ШІ, історія й мапа поверх гри працюють лише в самій програмі.</p>
        <div className="p-bar-ex" role="group" aria-label="Приклади запитів">
          {EXAMPLES.map(([t, m], i) => <button key={t} type="button" className="chip" onClick={() => setPick({ q: t, mode: m, n: i + Date.now() })}>{m === 'prices' ? <Icon name="tag" size={14} /> : <Icon name="search" size={14} />}{t}</button>)}
        </div>
        <div className="p-screen p-bar-screen">
          <BarDemo pick={pick} />
        </div>
      </section>

      {/* 3. можливості */}
      <section className="h-sec">
        <div className="h-head"><h2>Що вміє Q-Hub Desktop</h2></div>
        <div className="p-feats">
          {FEATURES.map(([ico, t, p]) => <div key={t} className="p-feat"><Icon name={ico} size={22} /><div><h3>{t}</h3><p className="muted">{p}</p></div></div>)}
        </div>
      </section>

      {/* 3а. комбінації клавіш — той самий список, що в програмі (кнопка «?» у плашці), src/lib/hotkeys.ts */}
      <section className="h-sec" id="klavishi">
        <div className="h-head"><h2>Комбінації клавіш</h2></div>
        <HotkeysTable />
        <p className="muted p-keys-note">Це типові клавіші. Alt+Q, Alt+M і Alt+F9 можна перепризначити в програмі: шестірня в плашці → «Основне» чи «Зір програми». Список у будь-який момент — кнопка <b>?</b> поруч із шестірнею. Як користуватися програмою крок за кроком — <Link to="/programa/instruktsiya">інструкція</Link>.</p>
      </section>

      {/* 4. вимоги */}
      <section className="h-sec">
        <div className="h-head"><h2>Що потрібно для запуску</h2></div>
        <div className="p-req">
          <div className="p-req-i"><h3>Вікно без рамки</h3><p className="muted">Windows 10 або 11. GTA V — у режимі <b>«Вікно без рамки»</b>: у повноекранному режимі програма не бачить HUD.</p></div>
          <div className="p-req-i"><h3>Акаунт Q-Hub</h3><p className="muted">Вхід через <b>Discord</b> і персонаж у кабінеті — щоб записи потрапляли куди треба.</p></div>
          <div className="p-req-i p-safe"><h3>Не лізе в гру</h3><p className="muted">Програма <b>не читає пам'ять гри</b> й нічого в ній не натискає — лише знімки екрана, як OBS.</p></div>
        </div>
      </section>

      {/* 5. журнал оновлень — той самий, що в програмі (Налаштування → Журнал оновлень), а не сторінка релізу на GitHub */}
      <section className="h-sec" id="onovlennya">
        <div className="h-head"><h2>Що нового в програмі</h2></div>
        <div className="p-log">
          {CHANGES.slice(0, logAll ? CHANGES.length : LOG_FEW).map((e, i) => (
            <article key={e.id} className="card p-log-e">
              <header><h3>{e.title}</h3><small className="muted">{dayOf(e.id)}{e.version ? `, версія ${e.version}` : ''}{i === 0 ? ' — найновіше' : ''}</small></header>
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
