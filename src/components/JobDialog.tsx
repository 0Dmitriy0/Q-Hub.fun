import { useEffect, useRef } from 'react';
import { FORUM_FAQ, type Job } from '../data/jobs';
import Icon from './Icon';
import Profit from './Profit';

/* вікно роботи: показує лише заповнені розділи; опис, заробіток і поради з'являться, коли їх допишемо */
const SECTIONS: [keyof Job, string][] = [
  ['requirements', 'Вимоги'], ['location', 'Де влаштуватися'], ['features', 'Особливості'],
  ['skills', 'Рівні навички'], ['progress', 'Прокачка навички'], ['controls', 'Керування'], ['tips', 'Поради']
];

export default function JobDialog({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (job) dlg.current?.showModal(); else dlg.current?.close(); }, [job?.id]);
  if (!job) return <dialog ref={dlg} className="modal jmodal" onClose={onClose} />;
  const list = (k: keyof Job) => (job[k] as string[] | undefined) || [];

  return (
    <dialog ref={dlg} className="modal jmodal" aria-labelledby="jd-title" onClose={onClose} onClick={e => { if (e.target === dlg.current) onClose(); }}>
      <div className="modal-box">
        <div className="row between">
          <div className="jd-head">
            <img className="jd-ico" src={`/icons/jobs/${job.id}.svg`} alt="" width={72} height={72} />
            <div><h2 id="jd-title">{job.name}</h2>
              <div className="jd-tags"><span className={'jtag' + (job.legal ? '' : ' ill')}>{job.legal ? 'Легальна' : 'Нелегальна'}</span>
                <span className="jtag lvl"><Icon name="trophy" size={13} />з {job.level} рівня</span><Profit n={job.profit} /></div></div>
          </div>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Закрити">✕</button>
        </div>
        <section className="jd-sec"><h3>Опис</h3>{job.description ? <p className="jd-text">{job.description}</p> : <p className="muted">Опис ще додаємо.</p>}</section>
        {job.pay && <section className="jd-sec"><h3>Заробіток</h3><p className="jd-text">{job.pay}</p></section>}
        <div className="jd-cols">{SECTIONS.filter(([k]) => list(k).length).map(([k, t]) => (
          <section className="jd-sec" key={k}><h3>{t}</h3><ul>{list(k).map((x, i) => <li key={i}>{x}</li>)}</ul></section>
        ))}</div>
        {job.forum && <p className="muted jd-src">Джерело: <a href={FORUM_FAQ} target="_blank" rel="noopener noreferrer">F.A.Q. «Роботи на сервері» на форумі QuantRP</a></p>}
      </div>
    </dialog>
  );
}
