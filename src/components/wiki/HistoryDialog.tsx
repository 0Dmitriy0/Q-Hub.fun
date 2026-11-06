import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { dbError, diff, type Data, type Section } from '../../lib/wiki';
import Icon from '../Icon';
import DiffView from './DiffView';
import { loadNames, resetNames } from './PageMeta';

/* історія картки (specs/043 FR-012, US3 AC3–4): версії з тим, хто запропонував і коли; «було → стало» між сусідніми.
   Бачать усі; «Повернути цю версію» і «Повернути сторінку» — лише admin і moderator (перевіряє база: wiki_revert, wiki_unhide) */
interface Ver { id: number; version_no: number; data: Data; kind: string; author: string | null; decided_by: string | null; note: string; created_at: string }
const KIND: Record<string, string> = { seed: 'Початкова', accept: 'Правка', revert: 'Відкат', hide: 'Прибрано', unhide: 'Повернуто', admin: 'Адмін' };
const when = (s: string) => new Date(s).toLocaleString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function HistoryDialog({ section, target, title, hidden, open, onClose, onChanged }: {
  section: Section; target: string; title: string; hidden?: boolean; open: boolean; onClose: () => void; onChanged?: () => void;
}) {
  const { role } = useAuth();
  const mod = role === 'admin' || role === 'moderator';
  const dlg = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState<Ver[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [pick, setPick] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from('wiki_versions').select('id,version_no,data,kind,author,decided_by,note,created_at')
      .eq('section', section).eq('target_id', target).order('version_no', { ascending: false }).limit(100);
    if (error) { setMsg('Не вдалося завантажити історію.'); setList([]); return; }
    setList(data as Ver[]);
    loadNames().then(setNames);
  }
  useEffect(() => {
    if (open) { setList(null); setPick(null); setReason(''); setMsg(''); dlg.current?.showModal(); load(); }
    else dlg.current?.close();
  }, [open, section, target]);

  async function act(kind: 'revert' | 'unhide') {
    if (!reason.trim()) { setMsg(kind === 'revert' ? 'Напиши, чому повертаєш цю версію (наприклад: вандалізм).' : 'Напиши, чому повертаєш сторінку.'); return; }
    setBusy(true); setMsg('');
    const { error } = kind === 'revert'
      ? await supabase!.rpc('wiki_revert', { p_section: section, p_target: target, p_version: pick, p_reason: reason.trim() })
      : await supabase!.rpc('wiki_unhide', { p_section: section, p_target: target, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setMsg(dbError(error)); return; }
    resetNames(); setPick(null); setReason('');
    setMsg(kind === 'revert' ? 'Версію повернуто — це нова версія в історії.' : 'Сторінку повернуто в списки.');
    await load(); onChanged?.();
  }

  const who = (id: string | null) => (id ? names.get(id) || 'гравець' : '');
  return (
    <dialog ref={dlg} className="modal wmodal" aria-labelledby="wh-t" onClose={onClose} onClick={e => { if (e.target === dlg.current) onClose(); }}>
      <div className="modal-box">
        <div className="row between"><h2 id="wh-t">Історія: {title}</h2>
          <button type="button" className="hud-b" onClick={onClose} aria-label="Закрити" title="Закрити"><Icon name="x" size={18} /></button></div>
        {mod && hidden && (
          <div className="news-confirm">
            <p>Сторінку прибрано зі списків — гравці її не бачать.</p>
            <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Чому повертаєш (наприклад: повернули в гру)" aria-label="Причина повернення" />
            <div className="row"><button type="button" className="btn acc sm" disabled={busy} onClick={() => act('unhide')}>Повернути сторінку</button></div>
          </div>
        )}
        {msg && <p className={/^(Версію|Сторінку)/.test(msg) ? 'good' : 'err'} role="status">{msg}</p>}
        {!list ? <p className="muted">Завантаження…</p> : !list.length ? (
          <p className="muted">Змін ще не було — це початкова версія з Q-Hub.</p>
        ) : (
          <ol className="whist">
            {list.map((v, i) => {
              const prev = list[i + 1];
              const ch = prev ? diff(section, prev.data, v.data) : {};
              const isCur = i === 0;
              return (
                <li key={v.id} className={'whist-v' + (pick === v.version_no ? ' on' : '')}>
                  <div className="whist-h">
                    <b>Версія {v.version_no}</b>
                    <span className="pill">{KIND[v.kind] ?? v.kind}</span>
                    {isCur && <span className="pill good">зараз</span>}
                    <span className="muted">{when(v.created_at)}{v.author ? ' · запропонував ' + who(v.author) : ''}{v.note ? ' · ' + v.note : ''}</span>
                  </div>
                  {prev && Object.keys(ch).length > 0 && <DiffView section={section} old={prev.data} changes={ch} />}
                  {prev && !Object.keys(ch).length && v.kind !== 'hide' && v.kind !== 'unhide' && <p className="muted">Поля не змінились.</p>}
                  {mod && !isCur && (pick === v.version_no ? (
                    <div className="news-confirm">
                      <p>Повернути картку до версії {v.version_no}? Це буде нова версія — історія не стирається.</p>
                      <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Причина (наприклад: вандалізм)" aria-label="Причина відкату" />
                      <div className="row">
                        <button type="button" className="btn acc sm" disabled={busy} onClick={() => act('revert')}>Так, повернути</button>
                        <button type="button" className="btn ghost sm" onClick={() => { setPick(null); setReason(''); }}>Скасувати</button>
                      </div>
                    </div>
                  ) : <button type="button" className="btn ghost sm" onClick={() => { setPick(v.version_no); setReason(''); setMsg(''); }}>Повернути цю версію</button>)}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </dialog>
  );
}
