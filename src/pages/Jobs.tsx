import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { filterJobs, type JobKind, type JobSort } from '../lib/jobs';
import Icon from '../components/Icon';
import Select from '../components/Select';
import JobDialog from '../components/JobDialog';
import Profit from '../components/Profit';
import { jobIcon } from '../components/JobDialog';
import ProposeForm, { takeIntent, type ProposeTarget } from '../components/wiki/ProposeForm';
import { useJobs, type JobRow } from '../lib/jobsData';
import { useAuth } from '../lib/auth';
import type { Data } from '../lib/wiki';

const KINDS: [JobKind, string][] = [['all', 'Усі'], ['legal', 'Легальні'], ['illegal', 'Нелегальні']];
const SORTS: [JobSort, string, string][] = [['name', 'За назвою', 'tag'], ['profit', 'За прибутковістю', 'coin'], ['level', 'За доступністю', 'trophy']];

export default function Jobs() {
  const { jobs: JOBS, fromDb, reload } = useJobs();
  const { session } = useAuth();
  /* пропозиція правки (specs/043): правити можна, коли роботи вже з бази — інакше немає версії картки */
  const [prop, setProp] = useState<{ t: ProposeTarget; mode: 'edit' | 'new' | 'hide' } | null>(null);
  const propose = (j: JobRow | null, mode: 'edit' | 'new' | 'hide') =>
    setProp({ mode, t: { section: 'job', id: j?.id ?? null, data: (j ?? {}) as unknown as Data, version: j?.version, title: j?.name ?? 'нова робота' } });
  /* після входу через Discord — та сама форма (FR-007) */
  useEffect(() => {
    if (!session || !fromDb) return;
    const it = takeIntent('job'); if (!it) return;
    if (it.mode === 'new') propose(null, 'new'); else { const j = JOBS.find(x => x.id === it.id); if (j) propose(j, it.mode); }
  }, [session, fromDb]);
  const [kind, setKind] = useState<JobKind>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<JobSort>('name');
  /* ?job=<id> відкриває вікно роботи одразу — так веде посилання з мапи */
  const [params, setParams] = useSearchParams();
  const [openId, setOpenIdRaw] = useState(() => params.get('job') || '');
  const setOpenId = (id: string) => { setOpenIdRaw(id); if (!id && params.has('job')) { params.delete('job'); setParams(params, { replace: true }); } };
  const counts = useMemo(() => ({ all: JOBS.length, legal: JOBS.filter(j => j.legal).length, illegal: JOBS.filter(j => !j.legal).length }), [JOBS]);
  const shown = useMemo(() => filterJobs(JOBS, kind, q, sort), [JOBS, kind, q, sort]);

  return (
    <>
      <section className="wiki-hero">
        <div>
          <span className="h-pill"><span className="mdot" aria-hidden="true" />База знань штату QuantRP</span>
          <h1>Роботи та професії</h1>
          <p className="muted">Легальні й нелегальні роботи QuantRP: з якого рівня, де влаштуватися, як прокачати навичку. Натисни на роботу, щоб відкрити подробиці.</p>
        </div>
        <div className="wiki-stats">
          <div><b className="mono">{counts.all}</b><small>Усього робіт</small></div>
          <div><b className="mono good">{counts.legal}</b><small>Легальні</small></div>
          <div><b className="mono bad">{counts.illegal}</b><small>Нелегальні</small></div>
        </div>
      </section>
      <div className="tbar">
        <div className="tabs" role="tablist" aria-label="Тип роботи">{KINDS.map(([k, label]) => (
          <a key={k} href={'#' + k} role="tab" aria-selected={kind === k} className={'tabpic' + (kind === k ? ' active' : '')} onClick={e => { e.preventDefault(); setKind(k); }}>
            <Icon name={k === 'illegal' ? 'shield' : 'jobs'} size={16} />{label}<span className="cnt">{counts[k]}</span>
          </a>))}</div>
        <div className="tbar-row">
          <div className="fld has-ico grow"><Icon name="search" /><input type="search" placeholder="Пошук роботи" value={q} onChange={e => setQ(e.target.value)} aria-label="Пошук роботи" /></div>
          <div className="fld sortf"><Select label="Сортування" value={sort} onChange={setSort} options={SORTS.map(([v, l, i]) => ({ value: v, label: l, icon: i }))} /></div>
        </div>
      </div>
      <div className="wiki-count"><span>Показано <b className="mono">{shown.length}</b> з {counts.all} робіт</span><span className="muted">Натисни на картку — відкриється опис</span>
        {fromDb && <button type="button" className="btn ghost sm" onClick={() => propose(null, 'new')}><Icon name="plus" size={15} />Додати роботу</button>}</div>
      {!shown.length && <div className="card empty wiki-none"><b>Робіт не знайдено</b><span className="muted">Зміни фільтр або очисти пошук.</span><button type="button" className="btn acc sm" onClick={() => { setQ(''); setKind('all'); }}>Скинути пошук</button></div>}
      <div className="jgrid">{shown.map(j => (
        <button type="button" key={j.id} className={'card jcard' + (j.legal ? '' : ' ill')} onClick={() => setOpenId(j.id)} aria-haspopup="dialog">
          <img className="jico" src={`/icons/jobs/${j.id}.svg`} alt="" width={64} height={64} loading="lazy" onError={jobIcon} />
          <span className="jname">{j.name}</span>
          <span className="jmeta"><span className="jtag lvl"><Icon name="trophy" size={13} />{j.level} рів.</span><Profit n={j.profit} /></span>
          {!j.legal && <span className="jtag ill jcorner">Нелегальна</span>}
        </button>
      ))}</div>
      <div className="wiki-tiles">
        <div className="card"><span className="ibub"><Icon name="chart" /></span><div><b>Прокачка навичок</b><p className="muted">У кожної роботи свої рівні навички: що вищий рівень, то більша надбавка. Скільки очок потрібно — в описі роботи.</p></div></div>
        <div className="card"><span className="ibub"><Icon name="shield" /></span><div><b>Нелегальні роботи</b><p className="muted">Позначені червоним. Перед тим як братися, прочитай вимоги й поради в описі.</p></div></div>
        <div className="card"><span className="ibub"><Icon name="map" /></span><div><b>Точки на мапі</b><p className="muted">Кнопка «Мітка на мапі» в описі роботи відкриває мапу штату одразу на місці влаштування.</p></div></div>
      </div>
      <JobDialog job={JOBS.find(j => j.id === openId) || null} onClose={() => setOpenId('')}
        onPropose={fromDb ? () => { const j = JOBS.find(x => x.id === openId); if (j) { setOpenId(''); propose(j, 'edit'); } } : undefined}
        onChanged={reload}
        onHide={fromDb ? () => { const j = JOBS.find(x => x.id === openId); if (j) { setOpenId(''); propose(j, 'hide'); } } : undefined} />
      <ProposeForm target={prop?.t ?? null} mode={prop?.mode ?? 'edit'} list={JOBS} onClose={() => setProp(null)} />
    </>
  );
}
