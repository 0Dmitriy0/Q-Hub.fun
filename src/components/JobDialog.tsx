import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FORUM_FAQ, type Job } from '../data/jobs';
import { POINTS } from '../data/mapPoints';
import { makeHash } from '../lib/mapGeo';
import Icon from './Icon';
import Profit from './Profit';
import PageMeta from './wiki/PageMeta';
import { jobIconSrc, type JobRow } from '../lib/jobsData';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { dbError } from '../lib/wiki';
import PicUpload from './PicUpload';
import IconGrid from './IconGrid';
import HistoryDialog from './wiki/HistoryDialog';
import WikiChecks from './wiki/WikiChecks';

/* нова робота від гравців може бути ще без своєї іконки — тоді загальна */
export const jobIcon = (e: React.SyntheticEvent<HTMLImageElement>) => { const i = e.currentTarget; if (!i.src.endsWith('/icons/map/jobs.svg')) i.src = '/icons/map/jobs.svg'; };

/* вікно роботи (design/stitch/wikiclickjob.html): показує лише заповнені розділи; опис, заробіток і поради з'являться, коли їх допишемо */
const SECTIONS: [keyof Job, string][] = [
  ['requirements', 'Вимоги'], ['location', 'Де влаштуватися'], ['features', 'Особливості'],
  ['skills', 'Рівні навички'], ['progress', 'Прокачка навички'], ['controls', 'Керування'], ['tips', 'Поради']
];

/* робота → шар мапи, який варто відкрити одразу (поля скарбів — зони, не мітки) */
const JOB_LAYER: Record<string, [string, string]> = { treasure: ['treasure-fields', 'Поля скарбів на мапі'] };

export default function JobDialog({ job, onClose, onPropose, onHide, onChanged }: { job: JobRow | null; onClose: () => void; onPropose?: () => void; onHide?: () => void; onChanged?: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [hist, setHist] = useState(false);
  const [err, setErr] = useState('');
  /* вибір з іконок мапи: готові + свої іконки категорій з бази (вантажаться, коли відкрили вибір) */
  const [pick, setPick] = useState(false);
  const [catIcons, setCatIcons] = useState<string[]>([]);
  useEffect(() => {
    if (!pick || catIcons.length || !supabase) return;
    supabase.from('map_categories').select('icon').then(({ data }) =>
      setCatIcons([...new Set((data ?? []).map(r => r.icon as string).filter(s => /^https:\/\//.test(s ?? '')))]));
  }, [pick]);   // eslint-disable-line react-hooks/exhaustive-deps
  const { role } = useAuth();
  /* іконка й видалення назавжди — лише admin (0062); у базі це теж перевіряється */
  const admin = role === 'admin' && !!supabase && job?.version !== undefined;
  useEffect(() => { setErr(''); setPick(false); if (job) dlg.current?.showModal(); else dlg.current?.close(); }, [job?.id]);
  if (!job) return <dialog ref={dlg} className="modal jmodal" onClose={onClose} />;
  const list = (k: keyof Job) => (job[k] as string[] | undefined) || [];
  /* точка влаштування на мапі — з тих самих даних, що й мітки «Роботи» на мапі */
  const pt = POINTS.find(p => p.kind === 'job' && p.job === job.id);
  const layer = JOB_LAYER[job.id];
  const setIcon = async (icon: string) => {
    const { error } = await supabase!.from('jobs').update({ icon }).eq('id', job.id);
    /* стара перевірка з 0062 пускала лише https — без 0063 готові іконки мапи (/icons/…) база не приймає */
    if (error) setErr(/jobs_icon_url/.test(error.message)
      ? (icon.startsWith('/') ? 'База ще не приймає іконки з мапи: запусти supabase/migrations/0063_job_icon_local.sql у Supabase → SQL Editor.' : 'Така адреса іконки не підходить.')
      : dbError(error));
    else { setErr(''); onChanged?.(); }
  };
  const purge = async () => {
    if (!confirm(`Видалити «${job.name}» назавжди? Зникнуть сторінка, її історія й усі пропозиції по ній. Повернути не вийде.`)) return;
    const { error } = await supabase!.rpc('wiki_purge_job', { p_id: job.id });
    if (error) { setErr(dbError(error)); return; }
    onClose(); onChanged?.();
  };

  return (
    <dialog ref={dlg} className="modal jmodal wdlg" aria-labelledby="jd-title" onClose={onClose} onClick={e => { if (e.target === dlg.current) onClose(); }}>
      <div className="modal-box">
        <div className="wdlg-h">
          <span className={'wdlg-ico' + (job.legal ? '' : ' ill')}><img src={jobIconSrc(job)} alt="" width={52} height={52} onError={jobIcon} /></span>
          <div className="wdlg-t"><h2 id="jd-title">{job.name}</h2>
            <div className="jd-tags"><span className={'jtag' + (job.legal ? '' : ' ill')}>{job.legal ? 'Легальна' : 'Нелегальна'}</span>
              <span className="jtag lvl"><Icon name="trophy" size={13} />з {job.level} рівня</span><Profit n={job.profit} /></div></div>
          <button type="button" className="hud-b wdlg-x" onClick={onClose} aria-label="Закрити" title="Закрити"><Icon name="x" size={18} /></button>
        </div>
        <section className="jd-sec wdlg-box"><h3>Опис</h3>{job.description ? <p className="jd-text">{job.description}</p> : <p className="muted">Опис ще додаємо.</p>}</section>
        {job.pay && <section className="jd-sec wdlg-box"><h3>Заробіток</h3><p className="jd-text">{job.pay}</p>
          <p className="muted jd-note">Суми — з тестів гравців і можуть бути застарілими. Знаєш точніше — запропонуй правку.</p></section>}
        <div className="jd-cols">{SECTIONS.filter(([k]) => list(k).length).map(([k, t]) => (
          <section className="jd-sec wdlg-box" key={k}><h3>{t}</h3><ul>{list(k).map((x, i) => <li key={i}>{x}</li>)}</ul></section>
        ))}</div>
        <PageMeta createdBy={job.created_by} updatedBy={job.updated_by} createdAt={job.created_at} updatedAt={job.updated_at} version={job.version} hidden={job.hidden} onHistory={job.version !== undefined ? () => setHist(true) : undefined} />
        {!job.hidden && <WikiChecks section="job" target={job.id} version={job.version} changedAt={job.updated_at ?? job.created_at} onPropose={onPropose} />}
        <HistoryDialog section="job" target={job.id} title={job.name} hidden={job.hidden} open={hist} onClose={() => setHist(false)} onChanged={onChanged} />
        {admin && (
          <div className="jd-admin row" aria-label="Адмін">
            <span className="muted">Адмін:</span>
            <PicUpload label={'Іконка роботи ' + job.name} text="Змінити іконку" path={`jobs/${job.id}-${Date.now().toString(36)}.webp`} frame={{ w: 128, h: 128 }} onDone={setIcon} />
            <button type="button" className={'btn ghost sm' + (pick ? ' on' : '')} aria-expanded={pick} onClick={() => setPick(p => !p)}>Іконка з мапи</button>
            {job.icon && <button type="button" className="btn ghost sm" onClick={() => setIcon('')}>Стандартна іконка</button>}
            {job.hidden && <button type="button" className="btn sm bad" onClick={purge}>Видалити назавжди</button>}
            {err && <span className="bad" role="alert">{err}</span>}
          </div>
        )}
        {admin && pick && <IconGrid label={'Іконка роботи ' + job.name} value={job.icon ?? null} extra={catIcons}
          onChange={v => { if (v) { setIcon(v); setPick(false); } }} />}
        <div className="wdlg-f">
          {job.forum ? <p className="muted jd-src">Джерело: <a href={FORUM_FAQ} target="_blank" rel="noopener noreferrer">F.A.Q. «Роботи на сервері» на форумі QuantRP</a></p> : <span />}
          <div className="row">
            {onPropose && <button type="button" className="btn ghost sm" onClick={onPropose}><Icon name="tag" size={15} />Запропонувати правку</button>}
            {onHide && <button type="button" className="btn ghost sm" onClick={onHide} title="Наприклад, роботу прибрали з гри">Прибрати сторінку</button>}
            {layer && <Link className="btn ghost sm" to={`/mapa?show=${layer[0]}`}><Icon name="map" size={16} />{layer[1]}</Link>}
            {pt && <Link className="btn acc sm" to={'/mapa' + makeHash(pt.x, pt.y, 5)}><Icon name="map" size={16} />Мітка на мапі</Link>}
          </div>
        </div>
      </div>
    </dialog>
  );
}
