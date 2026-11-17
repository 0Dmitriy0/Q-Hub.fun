import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { listMine, markAllRead, markRead, unreadCount, type Notice } from '../lib/notifications';
import Icon from './Icon';

/* Дзвіночок у шапці (specs/091 US4): лише для тих, хто увійшов. Лічильник — одразу після входу, кожні 60 с
   і при поверненні на вкладку (research R6: без realtime). Клік — 20 останніх; відкрите сповіщення стає прочитаним. */
const when = (s: string) => new Date(s).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function NotificationBell() {
  const { session } = useAuth();
  const uid = session?.user?.id;
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(() => {
    if (!uid) return;
    unreadCount().then(setCount).catch(() => { /* лічильник не критичний — спробуємо наступного разу */ });
  }, [uid]);

  useEffect(() => {
    if (!uid) { setCount(0); setItems(null); setOpen(false); return; }
    refresh();
    const t = setInterval(refresh, 60_000);
    const vis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [uid, refresh]);

  const load = useCallback(() => {
    setErr('');
    listMine(20).then(setItems).catch(() => setErr('Не вдалося завантажити сповіщення.'));
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  /* закриття: Esc (фокус — на кнопку) і клік поза списком */
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    addEventListener('keydown', key); addEventListener('mousedown', click);
    return () => { removeEventListener('keydown', key); removeEventListener('mousedown', click); };
  }, [open]);

  if (!uid) return null;

  const openOne = async (n: Notice) => {
    setExpanded(x => (x === n.id ? null : n.id));
    if (n.read_at) return;
    try {
      await markRead(n.id);
      setItems(list => list?.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? list);
      setCount(c => Math.max(0, c - 1));
    } catch { setErr('Не вдалося позначити прочитаним.'); }
  };
  const readAll = async () => {
    try {
      await markAllRead();
      const now = new Date().toISOString();
      setItems(list => list?.map(x => ({ ...x, read_at: x.read_at ?? now })) ?? list);
      setCount(0);
    } catch { setErr('Не вдалося позначити прочитаним.'); }
  };

  const label = count ? `Сповіщення: ${count} непрочитаних` : 'Сповіщення';
  return (
    <div className="bell" ref={box}>
      <button ref={btn} type="button" className="btn ghost sm bell-btn" aria-label={label} title={label} aria-expanded={open} aria-controls="bell-list"
        onClick={() => setOpen(v => !v)}>
        <Icon name="bell" size={16} />
        {count > 0 && <span className="nav-count" aria-hidden="true">{count > 9 ? '9+' : count}</span>}
      </button>
      <span className="sr" aria-live="polite">{count ? `${count} непрочитаних сповіщень` : ''}</span>
      {open && (
        <div id="bell-list" className="bell-pop" role="region" aria-label="Сповіщення">
          <div className="bell-h">
            <b>Сповіщення</b>
            {items?.some(n => !n.read_at) && <button type="button" className="btn ghost sm" onClick={readAll}>Позначити все прочитаним</button>}
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          {!items && !err && <p className="muted bell-empty">Вантажу…</p>}
          {items && !items.length && <p className="muted bell-empty">Сповіщень поки немає.</p>}
          {items && items.length > 0 && (
            <ul className="bell-list">
              {items.map(n => (
                <li key={n.id} className={n.read_at ? '' : 'unread'}>
                  <button type="button" className="bell-item" aria-expanded={expanded === n.id} onClick={() => openOne(n)}>
                    <span className="bell-t">{!n.read_at && <span className="bell-dot" aria-label="нове" />}{n.title}</span>
                    <small className="muted">{when(n.created_at)}</small>
                  </button>
                  {expanded === n.id && (
                    <div className="bell-body">
                      <p>{n.body}</p>
                      {n.prize && <p><b>🎁 Приз:</b> {n.prize}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
