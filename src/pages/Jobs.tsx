import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JOBS } from '../data/jobs';
import { filterJobs, type JobKind, type JobSort } from '../lib/jobs';
import Icon from '../components/Icon';
import Select from '../components/Select';
import JobDialog from '../components/JobDialog';
import Profit from '../components/Profit';

const KINDS: [JobKind, string][] = [['all', 'Усі'], ['legal', 'Легальні'], ['illegal', 'Нелегальні']];
const SORTS: [JobSort, string, string][] = [['name', 'За назвою', 'tag'], ['profit', 'За прибутковістю', 'coin'], ['level', 'За доступністю', 'trophy']];

export default function Jobs() {
  const [kind, setKind] = useState<JobKind>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<JobSort>('name');
  /* ?job=<id> відкриває вікно роботи одразу — так веде посилання з мапи */
  const [params, setParams] = useSearchParams();
  const [openId, setOpenIdRaw] = useState(() => params.get('job') || '');
  const setOpenId = (id: string) => { setOpenIdRaw(id); if (!id && params.has('job')) { params.delete('job'); setParams(params, { replace: true }); } };
  const counts = useMemo(() => ({ all: JOBS.length, legal: JOBS.filter(j => j.legal).length, illegal: JOBS.filter(j => !j.legal).length }), []);
  const shown = useMemo(() => filterJobs(JOBS, kind, q, sort), [kind, q, sort]);

  return (
    <>
      <div><h1>Роботи</h1><p className="muted">Легальні й нелегальні роботи QuantRP: з якого рівня, де влаштуватися, як прокачати навичку. Натисни на роботу, щоб відкрити подробиці.</p></div>
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
      {!shown.length && <div className="card empty">Нічого не знайдено. Спробуй іншу назву.</div>}
      <div className="jgrid">{shown.map(j => (
        <button type="button" key={j.id} className={'card jcard' + (j.legal ? '' : ' ill')} onClick={() => setOpenId(j.id)} aria-haspopup="dialog">
          <img className="jico" src={`/icons/jobs/${j.id}.svg`} alt="" width={64} height={64} loading="lazy" />
          <span className="jname">{j.name}</span>
          <span className="jmeta"><span className="jtag lvl"><Icon name="trophy" size={13} />{j.level} рів.</span><Profit n={j.profit} /></span>
          {!j.legal && <span className="jtag ill jcorner">Нелегальна</span>}
        </button>
      ))}</div>
      <JobDialog job={JOBS.find(j => j.id === openId) || null} onClose={() => setOpenId('')} />
    </>
  );
}
