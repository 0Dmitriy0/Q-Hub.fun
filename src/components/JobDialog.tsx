import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FORUM_FAQ, type Job } from '../data/jobs';
import { POINTS } from '../data/mapPoints';
import { makeHash } from '../lib/mapGeo';
import Icon from './Icon';
import Profit from './Profit';

/* вікно роботи (design/stitch/wikiclickjob.html): показує лише заповнені розділи; опис, заробіток і поради з'являться, коли їх допишемо */
const SECTIONS: [keyof Job, string][] = [
  ['requirements', 'Вимоги'], ['location', 'Де влаштуватися'], ['features', 'Особливості'],
  ['skills', 'Рівні навички'], ['progress', 'Прокачка навички'], ['controls', 'Керування'], ['tips', 'Поради']
];

export default function JobDialog({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (job) dlg.current?.showModal(); else dlg.current?.close(); }, [job?.id]);
  if (!job) return <dialog ref={dlg} className="modal jmodal" onClose={onClose} />;
  const list = (k: keyof Job) => (job[k] as string[] | undefined) || [];
  /* точка влаштування на мапі — з тих самих даних, що й мітки «Роботи» на мапі */
  const pt = POINTS.find(p => p.kind === 'job' && p.job === job.id);

  return (
    <dialog ref={dlg} className="modal jmodal wdlg" aria-labelledby="jd-title" onClose={onClose} onClick={e => { if (e.target === dlg.current) onClose(); }}>
      <div className="modal-box">
        <div className="wdlg-h">
          <span className={'wdlg-ico' + (job.legal ? '' : ' ill')}><img src={`/icons/jobs/${job.id}.svg`} alt="" width={52} height={52} /></span>
          <div className="wdlg-t"><h2 id="jd-title">{job.name}</h2>
            <div className="jd-tags"><span className={'jtag' + (job.legal ? '' : ' ill')}>{job.legal ? 'Легальна' : 'Нелегальна'}</span>
              <span className="jtag lvl"><Icon name="trophy" size={13} />з {job.level} рівня</span><Profit n={job.profit} /></div></div>
          <button type="button" className="hud-b wdlg-x" onClick={onClose} aria-label="Закрити" title="Закрити"><Icon name="x" size={18} /></button>
        </div>
        <section className="jd-sec wdlg-box"><h3>Опис</h3>{job.description ? <p className="jd-text">{job.description}</p> : <p className="muted">Опис ще додаємо.</p>}</section>
        {job.pay && <section className="jd-sec wdlg-box"><h3>Заробіток</h3><p className="jd-text">{job.pay}</p></section>}
        <div className="jd-cols">{SECTIONS.filter(([k]) => list(k).length).map(([k, t]) => (
          <section className="jd-sec wdlg-box" key={k}><h3>{t}</h3><ul>{list(k).map((x, i) => <li key={i}>{x}</li>)}</ul></section>
        ))}</div>
        <div className="wdlg-f">
          {job.forum ? <p className="muted jd-src">Джерело: <a href={FORUM_FAQ} target="_blank" rel="noopener noreferrer">F.A.Q. «Роботи на сервері» на форумі QuantRP</a></p> : <span />}
          {pt && <Link className="btn acc sm" to={'/mapa' + makeHash(pt.x, pt.y, 5)}><Icon name="map" size={16} />Мітка на мапі</Link>}
        </div>
      </div>
    </dialog>
  );
}
