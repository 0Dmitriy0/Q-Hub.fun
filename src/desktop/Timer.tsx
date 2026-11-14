import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { money } from '../lib/format';

/* Таймер заробітку (specs/086, contracts/timer-ipc.md): вікно поверх гри. Стан тримає головний процес (jobtimer.cjs),
   вікно лише малює й шле команди. free — Alt+Q відкрита: кнопки, підпис, історія; інакше вікно зафіксоване, кліки йдуть у гру.
   Підпис виміру: робота з довідника + рівень навички, власний замір чи без підпису. */
type Label = { kind: 'job'; id: string; name: string; level: number | null; variant?: string | null } | { kind: 'own'; name: string };
type Why = '' | 'sent' | 'no-label' | 'own' | 'no-level' | 'no-variant' | 'gone' | 'short' | 'flag' | 'login' | 'offline';
interface Sent { at: number; proposalId?: string; status?: string }
interface Change { at: number; acc?: 'cash' | 'bank'; d: number; add: number; kind: 'gain' | 'spend' | 'fix' | 'jump' | 'hold' }
interface View {
  state: 'ready' | 'wait' | 'run' | 'pause' | 'done' | null; id?: string; runMs?: number; gain?: number; perHour?: number | null;
  flag?: boolean; fixes?: number; pending?: number; log?: Change[]; blindMs?: number; blind?: boolean; interrupted?: boolean; label?: Label | null; suggest?: Label | null;
  free: boolean; streamer: boolean; opacity?: number; key: string; canPropose?: boolean; why?: Why; sent?: Sent | null;
}
interface Measure { id: string; endedAt: number | null; startedAt: number; runMs: number; gain: number; flag: boolean; blindMs: number; label: Label | null; sent: Sent | null }
interface Group { key: string; title: string; n: number; all: number; runMs: number; gain: number; perHour: number | null }
interface Hist { items: Measure[]; groups: Group[]; jobIds: string[] }
interface Job { id: string; name: string; variants?: string[] | null }
type Res = { ok: boolean; error?: string; why?: Why };
interface TimerApi {
  timerState(): Promise<View | null>; onTimerView(cb: (v: View) => void): () => void; timerCmd(c: 'start' | 'pause' | 'resume' | 'stop' | 'close'): Promise<View | null>;
  timerJobs(): Promise<Job[]>; timerLabel(a: { id?: string; label: Label | null }): Promise<Res>; timerHistory(): Promise<Hist | null>;
  timerDelete(id: string): Promise<Hist | null>; timerPropose(id: string): Promise<Res>; timerSize(h: number): Promise<void>;
}
const api = (window as unknown as { qhub: TimerApi }).qhub;

const WHY: Record<Exclude<Why, ''>, string> = {
  sent: 'Уже надіслано в довідник',
  'no-label': 'Обери роботу з довідника',
  own: 'Власний замір у довідник не йде',
  'no-level': 'Впиши рівень навички',
  'no-variant': 'Обери, що саме збирав',
  gone: 'Цієї роботи вже немає в довіднику',
  short: 'Заміряй щонайменше 10 хв',
  flag: 'Був сумнівний стрибок балансу',
  login: 'Увійди через Discord у програмі',
  offline: 'Немає зв’язку — спробуй пізніше',
};
const STATUS: Record<string, string> = { pending: 'на перевірці', conflict: 'на перевірці', accepted: 'опубліковано', accepted_edited: 'опубліковано', rejected: 'відхилено', withdrawn: 'відкликано' };

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (ms = 0) => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const dur = (ms = 0) => { const m = Math.round(ms / 60e3); return m >= 60 ? `${Math.floor(m / 60)} год ${m % 60} хв` : `${m} хв`; };
const when = (t: number | null) => (t ? new Date(t).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const title = (l: Label | null | undefined, jobs: Job[] = []) => (!l ? 'Без підпису' : l.kind === 'own' ? l.name
  : `${l.name} · ${l.variant ? l.variant : jobs.find(j => j.id === l.id)?.variants?.length ? 'що саме — не вказано' : l.level ? 'рівень ' + l.level : 'рівень не вказано'}`);

/* підпис виміру: робота + рівень / власний замір / без підпису (FR-009); наперед — останній підпис (FR-010a) */
function LabelForm({ id, init, jobs, onDone, saveText }: { id?: string; init: Label | null; jobs: Job[]; onDone: () => void; saveText: string }) {
  const [kind, setKind] = useState<'job' | 'own' | 'none'>(init ? init.kind : 'job');
  const [job, setJob] = useState(init?.kind === 'job' ? init.id : '');
  const [level, setLevel] = useState(init?.kind === 'job' && init.level ? String(init.level) : '');
  const [variant, setVariant] = useState(init?.kind === 'job' && init.variant ? init.variant : '');
  /* у роботи є варіанти (ферма: пшениця, гарбузи…) — замість рівня обирають, на чому заробляв */
  const variants = jobs.find(x => x.id === job)?.variants || null;
  const [own, setOwn] = useState(init?.kind === 'own' ? init.name : '');
  const [err, setErr] = useState('');
  const [levelErr, setLevelErr] = useState('');
  const checkLevel = (v: string) => setLevelErr(v.trim() && !/^\d{1,3}$/.test(v.trim()) || (v.trim() && (Number(v) < 1 || Number(v) > 100)) ? 'Рівень — ціле число від 1 до 100' : '');
  const save = async () => {
    setErr('');
    let label: Label | null = null;
    if (kind === 'job') {
      const j = jobs.find(x => x.id === job);
      if (!j) { setErr('Обери роботу зі списку'); return; }
      if (j.variants?.length) label = { kind: 'job', id: j.id, name: j.name, level: null, variant: variant || null };
      else label = { kind: 'job', id: j.id, name: j.name, level: level.trim() === '' ? null : Number(level.trim()), variant: null };
    } else if (kind === 'own') label = { kind: 'own', name: own };
    const r: Res = await api.timerLabel({ id, label }).catch((): Res => ({ ok: false, error: 'Не вдалося зберегти' }));
    if (!r.ok) { setErr(r.error || 'Не вдалося зберегти'); return; }
    onDone();
  };
  return <div className="tlabel">
    <div className="tseg" role="radiogroup" aria-label="Що заміряв">
      {([['job', 'Робота'], ['own', 'Власний замір'], ['none', 'Без підпису']] as const).map(([k, t]) =>
        <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setErr(''); }}>{t}</button>)}
    </div>
    {kind === 'job' && <>
      <label className="tfield"><span>Робота з довідника</span>
        <select value={job} onChange={e => { setJob(e.target.value); setErr(''); }}>
          <option value="">{jobs.length ? 'Обери роботу…' : 'Список робіт недоступний без зв’язку'}</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select></label>
      {variants ? <div className="tfield"><span id="tvar">Що збирав</span>
        <div className="tchips" role="radiogroup" aria-labelledby="tvar">{variants.map(v =>
          <button key={v} type="button" role="radio" aria-checked={variant === v} className={variant === v ? 'on' : ''} onClick={() => { setVariant(variant === v ? '' : v); setErr(''); }}>{v}</button>)}</div>
        <small>Необов’язково; для довідника — потрібно</small></div>
      : <label className="tfield"><span>Рівень навички</span>
        <input inputMode="numeric" value={level} placeholder="напр. 3" onChange={e => { setLevel(e.target.value); if (levelErr) checkLevel(e.target.value); }} onBlur={e => checkLevel(e.target.value)} aria-invalid={!!levelErr} />
        <small className={levelErr ? 'bad' : ''}>{levelErr || 'Необов’язково; для довідника — потрібно'}</small></label>}
    </>}
    {kind === 'own' && <label className="tfield"><span>Назва заміру</span>
      <input value={own} maxLength={60} placeholder="напр. риболовля на пірсі" onChange={e => { setOwn(e.target.value); setErr(''); }} />
      <small>Лише для твоєї історії — у довідник не йде</small></label>}
    {err && <p className="tnote bad" role="alert">{err}</p>}
    <button type="button" className="tbtn main" disabled={!!levelErr} onClick={save}><Icon name="check" size={14} />{saveText}</button>
  </div>;
}

function Propose({ id, can, why, sent, onSent }: { id: string; can: boolean; why: Why; sent: Sent | null | undefined; onSent: () => void }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  if (sent) return <p className="tnote good"><Icon name="check" size={13} />Надіслано в довідник{sent.status && STATUS[sent.status] ? ` · ${STATUS[sent.status]}` : ''}</p>;
  const go = async () => {
    setBusy(true); setMsg(null);
    const r: Res = await api.timerPropose(id).catch((): Res => ({ ok: false, why: 'offline' }));
    setBusy(false);
    if (r.ok) { setMsg({ t: 'Надіслано на перевірку' }); onSent(); return; }
    setMsg({ t: r.error || (r.why ? WHY[r.why as Exclude<Why, ''>] : 'Не вдалося надіслати'), bad: true });
  };
  return <div className="tprop">
    <button type="button" className="tbtn" disabled={!can || busy} onClick={go}><Icon name="book" size={14} />{busy ? 'Надсилаю…' : 'Запропонувати в довідник'}</button>
    {!can && why && <small>{WHY[why as Exclude<Why, ''>]}</small>}
    {msg && <small className={msg.bad ? 'bad' : 'good'} role="status">{msg.t}</small>}
  </div>;
}

export default function Timer() {
  const [v, setV] = useState<View>({ state: null, free: false, streamer: false, key: 'Alt+T' });
  const [tab, setTab] = useState<'now' | 'hist'>('now');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [hist, setHist] = useState<Hist | null>(null);
  const [edit, setEdit] = useState<string | null>(null);   // вимір з історії, якому міняють підпис
  const [ask, setAsk] = useState<string | null>(null);     // підтвердження видалення
  useEffect(() => {
    api.timerState().then(x => x && setV(x)).catch(() => {});
    return api.onTimerView(setV);
  }, []);
  /* список робіт — при підсумку чи історії (з бази або кешу) */
  useEffect(() => { if ((v.state === 'done' || tab === 'hist') && !jobs.length) api.timerJobs().then(setJobs).catch(() => {}); }, [v.state, tab, jobs.length]);
  const loadHist = () => api.timerHistory().then(h => h && setHist(h)).catch(() => {});
  useEffect(() => { if (tab === 'hist') loadHist(); }, [tab]);
  /* новий вимір — назад на «Вимір» */
  useEffect(() => { if (v.state === 'wait' || v.state === 'run') setTab('now'); }, [v.state]);
  /* Alt+Q закрита — без вкладки історії й форм: вікно лише показує */
  useEffect(() => { if (!v.free) { setEdit(null); setAsk(null); } }, [v.free]);

  /* висота вікна — під вміст: обгортка (її обрізає вікно) + те, що сховано під прокруткою тіла.
     Звіряємо з фактичною висотою вікна (а не з тим, що надсилали раніше): хай би що її збило — вікно саме виправиться.
     Після кожного малювання, при зміні розміру вікна й вмісту тіла. Головний процес обріже до 80 % екрана */
  const wrap = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  const fit = () => {
    const w = wrap.current, b = body.current;
    if (!w) return;
    const h = Math.ceil(w.offsetHeight + (b ? b.scrollHeight - b.clientHeight : 0));
    if (Math.abs(h - window.innerHeight) > 1) api.timerSize(h).catch(() => {});
  };
  useEffect(fit);
  useEffect(() => {
    const ro = new ResizeObserver(() => fit());
    if (body.current) [...body.current.children].forEach(c => ro.observe(c));
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  });

  const free = v.free, st = v.state, showHist = free && tab === 'hist';
  return <div className="twrap" ref={wrap}><div className={'twin' + (free ? ' free' : '')} style={v.opacity !== undefined && v.opacity < 1 ? { opacity: v.opacity } : undefined}>
    <div className="twin-head">
      <Icon name="clock" size={15} /><b>Таймер заробітку</b>
      {free && <div className="ttabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'now'} className={tab === 'now' ? 'on' : ''} onClick={() => setTab('now')}>Вимір</button>
        <button type="button" role="tab" aria-selected={tab === 'hist'} className={tab === 'hist' ? 'on' : ''} onClick={() => setTab('hist')}>Історія</button>
      </div>}
      {free && <button type="button" className="rwin-x" aria-label="Закрити таймер" title={st === 'done' ? 'Зберегти в історію й закрити' : 'Зупинити, зберегти й закрити'} onClick={() => api.timerCmd('close').catch(() => {})}><Icon name="x" size={14} /></button>}
    </div>

    {!showHist && <div className="tbody" ref={body}>
      {!st && <p className="tnote">Натисни <kbd>{v.key}</kbd> на роботі — таймер почне рахувати заробіток.</p>}
      {/* відкрито кнопкою з плашки — відлік ще не йде: «Старт» запускає й віддає керування грі */}
      {st === 'ready' && <>
        <div className="tclock paused">00:00:00<span>готовий</span></div>
        <p className="tnote">Почни працювати й натисни «Старт» — плашка сховається, керування повернеться в гру. Або <kbd>{v.key}</kbd> просто в грі.</p>
        {free && <button type="button" className="tbtn main wide" onClick={() => api.timerCmd('start').catch(() => {})}><Icon name="clock" size={14} />Старт</button>}
      </>}
      {st === 'wait' && <p className="tnote">Чекаю баланс… Відкрий гру — гроші мають бути видні в куті екрана.</p>}
      {(st === 'run' || st === 'pause' || st === 'done') && <>
        <div className={'tclock' + (st === 'pause' ? ' paused' : '')} aria-live="off">{clock(v.runMs)}{st === 'pause' && <span>пауза</span>}{st === 'done' && <span>підсумок</span>}</div>
        <div className="tnums">
          <div><small>Зароблено</small><b className="good">+{money(v.gain || 0)}</b></div>
          <div><small>За годину</small><b>{v.perHour != null ? '≈' + money(v.perHour) : '—'}</b></div>
        </div>
        {v.perHour == null && <p className="tnote">За годину — замало часу (рахується з 1 хв)</p>}
        {v.blind && st === 'run' && <p className="tnote warn"><Icon name="alert" size={13} />Баланс не видно — заробіток не рахується, поки гроші не з’являться на екрані</p>}
        {v.interrupted && st === 'pause' && <p className="tnote warn"><Icon name="alert" size={13} />Вимір перервано (програму закрили) — продовж чи зупини</p>}
        {v.flag && <p className="tnote warn"><Icon name="alert" size={13} />Був сумнівний стрибок балансу — він не врахований</p>}
        {!!v.pending && st === 'run' && <p className="tnote warn"><Icon name="clock" size={13} />Перевіряю +{money(v.pending)} — великий стрибок: врахую за 1,5 хв, якщо не виявиться помилкою зчитування</p>}
        {!!v.fixes && <p className="tnote"><Icon name="check" size={13} />Помилок зчитування виправлено: {v.fixes} — цифра, що «стрибнула» й повернулась, не рахується</p>}
        {/* останні зміни балансу — з відкритою Alt+Q: видно, що саме враховано */}
        {free && !!v.log?.length && <details className="tlog"><summary>Останні зміни балансу</summary><ul>{[...v.log].reverse().map(c =>
          <li key={c.at + ':' + (c.acc || '') + ':' + c.d + ':' + c.kind} className={c.kind}><span>{new Date(c.at).toLocaleTimeString('uk-UA')}</span>
            <b>{c.d > 0 ? '+' : '−'}{money(Math.abs(c.d))}</b>
            <small>{c.acc === 'bank' ? 'банк · ' : c.acc === 'cash' ? 'готівка · ' : ''}{c.kind === 'gain' ? 'враховано' : c.kind === 'spend' ? 'витрата — не віднімається' : c.kind === 'fix' ? 'помилка зчитування — не враховано' : c.kind === 'hold' ? 'перевіряю (великий стрибок)' : 'не підтвердилось — не враховано'}</small></li>)}</ul></details>}
        {st === 'done' && (v.blindMs || 0) >= 60e3 && <p className="tnote">Баланс не було видно {dur(v.blindMs)}</p>}
      </>}
      {free && (st === 'run' || st === 'pause') && <div className="tbtns">
        {st === 'run' ? <button type="button" className="tbtn" onClick={() => api.timerCmd('pause').catch(() => {})}><Icon name="minus" size={14} />Пауза</button>
          : <button type="button" className="tbtn" onClick={() => api.timerCmd('resume').catch(() => {})}><Icon name="plus" size={14} />Продовжити</button>}
        <button type="button" className="tbtn main" onClick={() => api.timerCmd('stop').catch(() => {})}><Icon name="check" size={14} />Стоп</button>
      </div>}
      {free && st === 'done' && v.id && <>
        {v.sent ? <p className="tnote">Підпис: <b>{title(v.label, jobs)}</b></p>
          : <LabelForm key={v.id} id={v.id} init={v.label ?? v.suggest ?? null} jobs={jobs} saveText="Зберегти підпис" onDone={() => {}} />}
        {v.label && !v.sent && <p className="tnote">Підпис: <b>{title(v.label, jobs)}</b></p>}
        <Propose id={v.id} can={!!v.canPropose} why={v.why || ''} sent={v.sent} onSent={() => {}} />
        <button type="button" className="tbtn wide" onClick={() => api.timerCmd('close').catch(() => {})}>Готово — в історію</button>
      </>}
      {!free && st && <p className="thint"><kbd>{v.key}</kbd> {st === 'done' ? 'у історію й сховати' : st === 'ready' ? 'старт' : st === 'wait' ? 'скасувати' : 'стоп і підсумок'} · <kbd>Alt+Q</kbd> — кнопки</p>}
    </div>}

    {showHist && <div className="tbody thist" ref={body}>
      {!hist ? <p className="tnote">Завантажую…</p> : !hist.items.length ? <p className="tnote">Ще немає вимірів — натисни <kbd>{v.key}</kbd> на роботі.</p> : <>
        <div className="tgroups">{hist.groups.map(g => <div key={g.key} className="tgroup">
          <b>{g.title}</b><small>{g.n} {g.n === 1 ? 'вимір' : 'вимірів'} · {dur(g.runMs)}</small>
          <span>{g.perHour != null ? '≈' + money(g.perHour) + '/год' : '—'}</span></div>)}</div>
        <ul className="titems">{hist.items.map(m => {
          const ph = m.runMs >= 60e3 ? Math.round(m.gain / (m.runMs / 36e5)) : null;
          const jobOk = m.label?.kind === 'job' && hist.jobIds.includes(m.label.id);
          const varJob = m.label?.kind === 'job' && !!jobs.find(j => j.id === (m.label as { id: string }).id)?.variants?.length;
          const why: Why = m.sent ? 'sent' : !m.label ? 'no-label' : m.label.kind === 'own' ? 'own'
            : varJob ? (!m.label.variant ? 'no-variant' : '') || (hist.jobIds.length && !jobOk ? 'gone' : m.runMs < 600e3 ? 'short' : m.flag ? 'flag' : '')
            : m.label.level == null ? 'no-level' : hist.jobIds.length && !jobOk ? 'gone' : m.runMs < 600e3 ? 'short' : m.flag ? 'flag' : '';
          return <li key={m.id} className="titem">
            <div className="titem-top"><b>{title(m.label, jobs)}</b><small>{when(m.endedAt ?? m.startedAt)}</small></div>
            <div className="titem-nums">{dur(m.runMs)} · +{money(m.gain)} · {ph != null ? '≈' + money(ph) + '/год' : '—'}{m.flag && <span className="warn"> · сумнівний</span>}</div>
            {edit === m.id ? <LabelForm id={m.id} init={m.label} jobs={jobs} saveText="Зберегти" onDone={() => { setEdit(null); loadHist(); }} />
              : ask === m.id ? <div className="tbtns"><span className="tnote">Видалити вимір?</span>
                <button type="button" className="tbtn bad" onClick={() => { setAsk(null); api.timerDelete(m.id).then(h => h && setHist(h)).catch(() => {}); }}>Видалити вимір</button>
                <button type="button" className="tbtn" onClick={() => setAsk(null)}>Залишити</button></div>
              : <div className="tbtns">
                {!m.sent && <button type="button" className="tbtn" onClick={() => setEdit(m.id)}><Icon name="edit" size={13} />Підпис</button>}
                <button type="button" className="tbtn" onClick={() => setAsk(m.id)}><Icon name="x" size={13} />Видалити</button>
              </div>}
            {edit !== m.id && <Propose id={m.id} can={!why} why={why} sent={m.sent} onSent={loadHist} />}
          </li>;
        })}</ul>
      </>}
    </div>}
  </div></div>;
}
