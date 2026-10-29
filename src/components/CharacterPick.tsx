import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { pickPlan, type PickChar } from '../lib/characterPick';

/* з якого персонажа вписати ціну вручну (specs/025 FR-015): pick() → { id } | { error } | null (скасовано).
   При 2–3 персонажах — діалог, підказка — поточний; при одному — одразу; dialog — покласти в розмітку сторінки */
type Res = { id: string } | { error: string } | null;

export function useCharacterPick() {
  const { characters, current } = useAuth();
  const [ask, setAsk] = useState<{ options: PickChar[]; suggested: string; done: (r: Res) => void } | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ask) dlg.current?.showModal(); else dlg.current?.close(); }, [ask]);

  const pick = useCallback((): Promise<Res> => {
    const p = pickPlan(characters, current?.id);
    if (p.kind === 'none') return Promise.resolve({ error: p.error });
    if (p.kind === 'auto') return Promise.resolve({ id: p.id });
    return new Promise(done => setAsk({ options: p.options, suggested: p.suggested, done }));
  }, [characters, current?.id]);

  const finish = (r: Res) => { ask?.done(r); setAsk(null); };
  const dialog = (
    <dialog ref={dlg} className="modal" aria-labelledby="pick-title" onCancel={e => { e.preventDefault(); finish(null); }}>
      {ask && <div className="modal-box">
        <h2 id="pick-title">З якого персонажа вписуєш ціну?</h2>
        <p className="muted note">Біля ціни всі побачать твій нік і Ім'я_Прізвище цього персонажа.</p>
        <div className="list">{ask.options.map(c => (
          <button key={c.id} type="button" className={'btn' + (c.id === ask.suggested ? ' acc' : ' ghost')} autoFocus={c.id === ask.suggested}
            onClick={() => finish({ id: c.id })}>{c.name}{c.static_id ? <span className="mono"> #{c.static_id}</span> : null}</button>))}</div>
        <button type="button" className="btn ghost sm" onClick={() => finish(null)}>Скасувати — не вписувати</button>
      </div>}
    </dialog>
  );
  return { pick, dialog };
}
