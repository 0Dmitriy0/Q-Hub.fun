import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { nickError, nickLockedUntil } from '../lib/nick';

/* нік акаунта в Q-Hub обов'язковий (specs/025): поки його немає, після входу висить це вікно — закрити його можна
   лише вибравши нік або вийшовши з акаунта. Ту саму форму показує кабінет, щоб нік можна було змінити (раз на 30 днів) */
const day = (d: Date) => d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

export function NickForm({ onDone, submitLabel = 'Зберегти' }: { onDone?: () => void; submitLabel?: string }) {
  const { nick, nickChangedAt, saveNick } = useAuth();
  const [v, setV] = useState(nick || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = nick ? nickLockedUntil(nickChangedAt) : null;
  return (
    <form className="static-form" onSubmit={async e => {
      e.preventDefault();
      const n = v.trim();
      const bad = nickError(n); if (bad) { setErr(bad); return; }
      if (n === nick) { onDone?.(); return; }
      setBusy(true); const m = await saveNick(n); setBusy(false);
      if (m) setErr(m); else { setErr(''); onDone?.(); }
    }}>
      <label className="fld"><span>Нік у Q-Hub</span>
        <input autoComplete="off" spellCheck={false} maxLength={20} placeholder="наприклад D_VYRX" value={v} disabled={!!locked}
          onChange={e => { setV(e.target.value); setErr(''); }} required />
      </label>
      {locked && <small className="muted">Нік можна змінювати раз на 30 днів — наступна зміна з {day(locked)}.</small>}
      {err && <small className="err" role="alert">{err}</small>}
      {!locked && <button className="btn acc" disabled={busy}>{busy ? 'Зберігаю…' : submitLabel}</button>}
    </form>
  );
}

export default function NickGate() {
  const { session, nick, signOut } = useAuth();
  const dlg = useRef<HTMLDialogElement>(null);
  const need = !!session && nick === null;
  useEffect(() => { if (need) dlg.current?.showModal(); else dlg.current?.close(); }, [need]);
  return (
    <dialog ref={dlg} className="modal" aria-labelledby="nick-title" onCancel={e => e.preventDefault()}>
      <div className="modal-box">
        <h2 id="nick-title">Вибери нік у Q-Hub</h2>
        <p className="muted note">Під цим ніком тебе бачать у рейтингу й біля цін, які ти оновлюєш. Ім'я_Прізвище й статік персонажа — у програмі Q-Hub, у кожного персонажа свої.</p>
        <NickForm submitLabel="Далі" />
        <button type="button" className="btn ghost sm" onClick={signOut}>Вийти з акаунта</button>
      </div>
    </dialog>
  );
}
