import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';

/* нік персонажа і статік обов'язкові: поки їх немає, після входу висить це вікно — закрити його можна
   лише зберігши дані або вийшовши з акаунта. Ту саму форму показує кабінет, щоб їх можна було змінити */
const NICK = /^[\p{L}\d _.-]{3,32}$/u;

export function StaticForm({ onDone, submitLabel = 'Зберегти' }: { onDone?: () => void; submitLabel?: string }) {
  const { staticId, gameName, saveProfile } = useAuth();
  const [nick, setNick] = useState(gameName);
  const [v, setV] = useState(staticId ? String(staticId) : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="static-form" onSubmit={async e => {
      e.preventDefault();
      const g = nick.trim(), n = Number(v.replace(/\D/g, ''));
      if (!NICK.test(g)) { setErr('Нік персонажа — як у грі, від 3 до 32 символів, наприклад Ivan_Petrov.'); return; }
      if (!(n >= 1 && n <= 999999999)) { setErr('Статік — це число з гри, наприклад 12345.'); return; }
      setBusy(true); const m = await saveProfile(g, n); setBusy(false);
      if (m) setErr(m); else { setErr(''); onDone?.(); }
    }}>
      <label className="fld"><span>Нік персонажа в грі</span>
        <input autoComplete="off" placeholder="наприклад Ivan_Petrov" value={nick} onChange={e => { setNick(e.target.value); setErr(''); }} required />
      </label>
      <label className="fld"><span>Статік (ID персонажа)</span>
        <input inputMode="numeric" autoComplete="off" placeholder="наприклад 12345" value={v} onChange={e => { setV(e.target.value); setErr(''); }} required />
      </label>
      {err && <small className="err" role="alert">{err}</small>}
      <button className="btn acc" disabled={busy}>{busy ? 'Зберігаю…' : submitLabel}</button>
    </form>
  );
}

export default function StaticGate() {
  const { session, staticId, signOut } = useAuth();
  const dlg = useRef<HTMLDialogElement>(null);
  const need = !!session && staticId === null;
  useEffect(() => { if (need) dlg.current?.showModal(); else dlg.current?.close(); }, [need]);
  return (
    <dialog ref={dlg} className="modal" aria-labelledby="static-title" onCancel={e => e.preventDefault()}>
      <div className="modal-box">
        <h2 id="static-title">Вкажи нік персонажа і статік</h2>
        <p className="muted note">Без них не можна оновлювати ціни. Біля кожної зміни ціни всі бачать нік персонажа і статік того, хто її вніс.</p>
        <StaticForm />
        <button type="button" className="btn ghost sm" onClick={signOut}>Вийти з акаунта</button>
      </div>
    </dialog>
  );
}
