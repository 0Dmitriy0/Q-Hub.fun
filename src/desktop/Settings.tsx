import { useEffect, useState, type ReactNode } from 'react';
import Icon from '../components/Icon';
import { toAccelerator } from './hotkey';
import type { Prefs } from './Bar';
import LOG from '../data/changelog.json';

/* Налаштування плашки — як у помічників для RP-серверів: ліворуч профіль, розділи й версія програми,
   праворуч картки з рядками «назва — перемикач». Зберігає головний процес (barPrefs у desktop/src/main.cjs). */

interface SetApi {
  shotsStats(): Promise<{ stats: Record<string, number>; key: string }>; shotsOpen(): Promise<void>; visionLogOpen(): Promise<void>;
  aiLeft(): Promise<number | null>;
}
const api = (window as unknown as { qhub: SetApi }).qhub;
export const AI_DAY = 50;   // питань до ШІ на день — так само, як у 0027_assistant_limit_50.sql
/* клавіші мітки з гри — готові варіанти: F9 без модифікатора гра забирає собі */
const PIN_KEYS = ['Alt+F9', 'Alt+M', 'Ctrl+F9', 'Alt+X'];

export type SetSec = 'main' | 'ai' | 'vision' | 'keys' | 'faq' | 'changes';
const NAV: [SetSec, string, string][] = [['main', 'Основне', 'gear'], ['ai', 'Відповіді ШІ', 'spark'], ['vision', 'Зір програми', 'camera'], ['keys', 'Клавіші', 'bolt'], ['faq', 'Часті питання', 'book'], ['changes', 'Журнал оновлень', 'history']];

/* журнал оновлень (src/data/changelog.json): найновіший — першим; id — дата релізу */
interface Entry { id: string; version?: string; title: string; added?: string[]; changed?: string[]; fixed?: string[] }
export const CHANGES = (LOG as { entries: Entry[] }).entries;
/* скільки записів журналу гравець ще не бачив: seen — id останнього побаченого (null — ще жодного) */
export const unseenCount = (seen: string | null) => { const i = CHANGES.findIndex(e => e.id === seen); return i < 0 ? CHANGES.length : i; };
const GROUPS: ['added' | 'changed' | 'fixed', string, string][] = [['added', 'Додано', 'good'], ['changed', 'Змінено', 'warn'], ['fixed', 'Виправлено', 'acc']];
const dayOf = (id: string) => new Date(id + 'T12:00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

/* часті питання: [група, [питання, відповідь][]] */
const FAQ: [string, [string, string][]][] = [
  ['Гра й плашка', [
    ['Плашка не відкривається по гарячій клавіші', 'Клавішу, найімовірніше, зайняла інша програма. Признач іншу в «Основне → Гаряча клавіша» або відкрий плашку з іконки Q-Hub у треї.'],
    ['Плашка ховається, щойно клацаю в гру', 'Так задумано, щоб не заважати грі. Щоб лишалась — увімкни «Не ховати, коли повертаюсь у гру» або натисни шпильку в рядку.'],
    ['Плашки не видно поверх гри або гра згортається', 'Постав у налаштуваннях графіки гри режим «Вікно без рамки» (Borderless). У повноекранному режимі Windows не дає показувати вікна поверх гри.'],
  ]],
  ['Облік', [
    ['Як записати угоду', 'Напиши в рядку, як сказав би другу: «продав 169 камбали по 226», «купив 20 гливи за 3000», «нафармив 47 колод» — і Enter. Під рядком видно, що саме запишеться.'],
    ['Як виправити чи видалити запис', 'Shift+Enter і напиши: «видали останній запис» або «останній запис — на картку». ШІ покаже план, Enter його виконає. Або відкрий «Облік» на головній плашки.'],
    ['Звідки програма бере гроші й ціни', 'Якщо увімкнено «Зір програми», вона читає готівку й картку з HUD гри та ціни скупників з екрана — лише поки гра запущена.'],
  ]],
  ['ШІ й програма', [
    ['Скільки питань можна поставити ШІ', `${AI_DAY} на день, лічильник оновлюється о 00:00 за Києвом. Пошук у правилах (звичайний Enter) і записи сум — без ліміту.`],
    ['Як оновити програму', 'Коли вийде нова версія, на головній плашки й у меню іконки в треї з’явиться «Оновити». Програма перезапуститься сама.'],
    ['Персонажа немає у списку', 'Створи його в кабінеті на сайті q-hub.fun («Налаштування → Персонажі») — після перезапуску програми він з’явиться тут.'],
  ]],
];

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return <button className={'stog' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)}><i /></button>;
}
function Row({ t, d, children }: { t: string; d?: ReactNode; children?: ReactNode }) {
  return <div className="srow"><div><b>{t}</b>{d && <small>{d}</small>}</div>{children}</div>;
}
const Keys = ({ k }: { k: string }) => <span className="skeys">{k.split('+').map(x => <kbd key={x}>{x}</kbd>)}</span>;
/* поле-запис комбінації: клік — «натисни клавіші», Esc — скасувати */
function KeyRec({ value, set }: { value: string; set: (k: string) => void }) {
  const [rec, setRec] = useState(false);
  return <button className={'skrec' + (rec ? ' on' : '')} onClick={() => setRec(true)} onBlur={() => setRec(false)}
    onKeyDown={e => { if (!rec) return; e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { setRec(false); return; } const a = toAccelerator(e); if (a) { setRec(false); set(a); } }}>
    {rec ? 'Натисни комбінацію…' : <Keys k={value} />}</button>;
}

export default function Settings({ prefs, save, staff, user, version, start = 'main', unseen, onSeen }: {
  prefs: Prefs; save: (p: Partial<Prefs>) => void; staff: boolean; version?: string; start?: SetSec; unseen: number; onSeen: () => void;
  user: { name: string; avatar: string | null; gameName: string; staticId: number | null } | null;
}) {
  const [sec, setSec] = useState<SetSec>(start);
  const [fresh] = useState(unseen);   // «нове» лишається на записах, поки розділ відкритий, хоч їх уже позначено побаченими
  useEffect(() => { if (sec === 'changes' && unseen) onSeen(); }, [sec, unseen, onSeen]);
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  const [shots, setShots] = useState<{ n: number; key: string } | null>(null);
  useEffect(() => { if (sec === 'ai') api.aiLeft().then(setLeft); if (sec === 'vision') api.shotsStats().then(s => setShots({ n: Object.values(s.stats).reduce((a, b) => a + b, 0), key: s.key })); }, [sec]);
  const title = NAV.find(n => n[0] === sec)![1];

  return (
    <div className="sset">
      <aside className="snav">
        {user && <div className="sme">{user.avatar ? <img src={user.avatar} alt="" /> : <span className="bava">{user.name[0]}</span>}
          <div><b>{user.name}</b><small>{user.gameName ? `${user.gameName}${user.staticId ? ' #' + user.staticId : ''}` : 'нік — у кабінеті'}</small></div></div>}
        <nav>{NAV.map(([k, l, ico]) => <button key={k} aria-current={sec === k ? 'page' : undefined} onClick={() => setSec(k)}><Icon name={ico} size={16} />{l}{k === 'changes' && unseen > 0 && <span className="sdot" aria-label={`нових: ${unseen}`}>{unseen}</span>}</button>)}</nav>
        {version && <small className="sver">Q-Hub v{version}</small>}
      </aside>
      <div className="sbody">
        <h3>{title}</h3>
        {sec === 'main' && <>
          <div className="scard">
            <Row t="Гаряча клавіша" d="Показати чи сховати плашку">
              <span className="row">{prefs.hotkey !== 'Alt+Q' && <button className="slink" onClick={() => save({ hotkey: 'Alt+Q' })}>скинути</button>}<KeyRec value={prefs.hotkey} set={k => save({ hotkey: k })} /></span>
            </Row>
            <Row t="Мапа Q-Hub" d="Показати чи сховати мапу поверх гри">
              <span className="row">{(prefs.mapKey || 'Alt+M') !== 'Alt+M' && <button className="slink" onClick={() => save({ mapKey: 'Alt+M' })}>скинути</button>}<KeyRec value={prefs.mapKey || 'Alt+M'} set={k => save({ mapKey: k })} /></span>
            </Row>
            <Row t="Де з’являється">
              <div className="bseg sm">{([['top', 'Зверху'], ['center', 'По центру'], ['bottom', 'Знизу']] as const).map(([k, l]) => <button key={k} aria-pressed={prefs.position === k} onClick={() => save({ position: k })}>{l}</button>)}</div>
            </Row>
            <Row t="Прозорість"><span className="row"><input type="range" min={60} max={100} value={Math.round(prefs.opacity * 100)} onChange={e => save({ opacity: Number(e.target.value) / 100 })} aria-label="Прозорість" /><b className="mono">{Math.round(prefs.opacity * 100)}%</b></span></Row>
          </div>
          <div className="scard">
            <Row t="Запускати разом з Windows" d="Q-Hub стартує тихо в треї, коли вмикаєш комп'ютер, — Alt+Q одразу під рукою"><Toggle on={!!prefs.autostart} set={v => save({ autostart: v })} label="Запускати разом з Windows" /></Row>
            <Row t="Оновлювати автоматично" d="Нова версія завантажується у фоні й ставиться, коли програмою 10 хв не користуються, або при виході"><Toggle on={prefs.autoUpdate !== false} set={v => save({ autoUpdate: v })} label="Оновлювати автоматично" /></Row>
            <Row t="Не ховати, коли повертаюсь у гру" d="Те саме, що шпилька в рядку"><Toggle on={prefs.pinned} set={v => save({ pinned: v })} label="Не ховати" /></Row>
            <Row t="Вкладка з найближчим івентом" d="Над рядком плашки"><Toggle on={prefs.tab} set={v => save({ tab: v })} label="Вкладка з івентом" /></Row>
          </div>
        </>}
        {sec === 'ai' && <>
          <div className="scard">
            <Row t="Відповідей сьогодні" d="Оновлюються о 00:00 за Києвом">
              <span className="sbig">{left === undefined ? '…' : left === null ? '—' : <><b>{left}</b> з {AI_DAY}</>}</span>
            </Row>
          </div>
          <div className="scard">
            <Row t="Спитати ШІ" d="Пише своїми словами — ШІ відповідає з правил сервера й твоїх записів, а записати пропонує планом"><Keys k="Shift+Enter" /></Row>
            <Row t="Пошук у правилах і записи сум" d="Без ШІ й без ліміту"><Keys k="Enter" /></Row>
          </div>
          {left === null && <p className="muted">Лічильник з’явиться, коли на сервері оновлять базу (міграція 0027).</p>}
        </>}
        {sec === 'vision' && <>
          <div className="scard">
            <Row t="Автооблік з екрана" d="Гроші з HUD гри → записи з місцем (магазин, скупник…)"><Toggle on={prefs.autoLedger} set={v => save({ autoLedger: v })} label="Автооблік" /></Row>
            <Row t="Ціни скупників на сайт" d="Від мого імені, коли бачу їх у грі"><Toggle on={prefs.autoPrices} set={v => save({ autoPrices: v })} label="Ціни на сайт" /></Row>
            <Row t="Журнал зору" d="Що програма побачила на екрані"><button className="btn sm" onClick={() => api.visionLogOpen()}>Відкрити</button></Row>
          </div>
          <div className="scard">
            <Row t="Навчальні знімки" d={<><Keys k={shots?.key ?? 'Alt+S'} /> у грі · зібрано {shots?.n ?? 0}</>}><button className="btn sm" onClick={() => api.shotsOpen()}>Відкрити папку</button></Row>
            <Row t="Ділитися знімками" d="Допомагають навчити програму читати екран"><Toggle on={prefs.shareShots} set={v => save({ shareShots: v })} label="Ділитися знімками" /></Row>
            {staff && <Row t="Мітка з гри" d="На великій карті — знімок іде чернеткою на сайт. Клавіші без Alt/Ctrl гра забирає собі">
              <span className="row">{PIN_KEYS.map(k => <button key={k} className={'skrec' + (prefs.pinKey === k ? ' on' : '')} aria-pressed={prefs.pinKey === k} onClick={() => save({ pinKey: k })}><Keys k={k} /></button>)}
                {!PIN_KEYS.includes(prefs.pinKey || '') && <KeyRec value={prefs.pinKey || 'Alt+F9'} set={k => save({ pinKey: k })} />}</span>
            </Row>}
          </div>
          <p className="muted">Зір працює, лише коли запущена гра.</p>
        </>}
        {sec === 'keys' && <div className="scard">
          {([['Показати чи сховати плашку', prefs.hotkey], ['Пошук у правилах або записати суму', 'Enter'], ['Спитати ШІ', 'Shift+Enter'], ['Пошук ↔ Ціни', 'Tab'],
            ['Вибрати пункт у списку', '↑+↓'], ['Очистити рядок → закрити → сховати', 'Esc'], ['Навчальний знімок гри', 'Alt+S'], ['Мапа Q-Hub поверх гри', prefs.mapKey || 'Alt+M'], ['«Де я?» — з відкритою великою картою гри', prefs.mapKey || 'Alt+M'],
            ...(staff ? [['Мітка на мапі з гри', prefs.pinKey || 'Alt+F9']] : [])] as [string, string][]).map(([t, k]) => <Row key={t} t={t}><Keys k={k} /></Row>)}
        </div>}
        {sec === 'changes' && <>
          <p className="muted">Що змінилось у програмі — найновіше зверху. Зараз у тебе {version ? `v${version}` : 'ця версія'}.</p>
          {CHANGES.map((e, i) => (
            <section key={e.id} className="scard slog">
              <header><b>{e.title}</b><small>{e.version ? `v${e.version} · ` : ''}{dayOf(e.id)}</small>{i < fresh && <span className="pill good">нове</span>}</header>
              {GROUPS.map(([k, l, tone]) => e[k]?.length ? <div key={k} className={'slog-g ' + tone}><h4>{l}</h4><ul>{e[k]!.map(t => <li key={t}>{t}</li>)}</ul></div> : null)}
            </section>))}
        </>}
        {sec === 'faq' && FAQ.map(([g, list]) => (
          <section key={g} className="sfaq">
            <h4>{g}</h4>
            <div className="scard">{list.map(([q, a]) => <details key={q}><summary>{q}<Icon name="chev" size={15} /></summary><p>{a}</p></details>)}</div>
          </section>))}
      </div>
    </div>
  );
}
