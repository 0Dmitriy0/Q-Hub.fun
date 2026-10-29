import { useEffect, useState } from 'react';
import { desktop, type UpdateState } from '../lib/app';

/* смужка внизу кабінету: вийшла нова версія програми → «Оновити». Програма сама завантажує, закривається й ставить її.
   З автооновленням (specs/006) версія завантажується у фоні й чекає простою — кнопка ставить її одразу */
export default function UpdateBanner() {
  const [u, setU] = useState<UpdateState | null>(null);
  useEffect(() => {
    desktop?.updateState?.().then(s => s && setU(s));
    return desktop?.onUpdate?.(s => setU(p => ({ ...s, current: p?.current })));
  }, []);
  if (!u || u.status === 'idle') return null;
  const waiting = u.status === 'ready' && u.auto;   // завантажено, чекає простою
  const busy = u.status !== 'available' && !waiting;
  return (
    <div className="upd" role="status" aria-live="polite">
      <span className="upd-text">
        {u.status === 'available' && <>Вийшла нова версія Q-Hub <b>{u.version}</b>{u.current && <small> · у тебе {u.current}</small>}</>}
        {u.status === 'downloading' && <>Завантажую оновлення… {u.percent}%</>}
        {u.status === 'ready' && (waiting ? <>Оновлення <b>{u.version}</b> готове — поставиться само, коли не користуватимешся програмою</> : <>Встановлюю {u.version} — програма перезапуститься сама</>)}
        {u.error && <small className="upd-err">{u.error}</small>}
      </span>
      {u.status === 'downloading' && <span className="upd-bar" aria-hidden="true"><span style={{ width: u.percent + '%' }} /></span>}
      <button type="button" className="btn acc" disabled={busy} onClick={() => desktop?.updateInstall?.()}>
        {u.error ? 'Спробувати ще' : waiting ? 'Оновити зараз' : 'Оновити'}
      </button>
    </div>
  );
}
