import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';

/* статік обов'язковий: поки його немає, після входу висить це вікно — закрити його можна лише
   зберігши статік або вийшовши з акаунта. Цю ж форму показує кабінет, щоб статік можна було змінити */
export function StaticForm({ onDone, submitLabel = 'Зберегти' }: { onDone?: () => void; submitLabel?: string }) {
  const { staticId, saveStatic } = useAuth();
  const [v, setV] = useState(staticId ? String(staticId) : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="static-form" onSubmit={async e => {
      e.preventDefault();
      const n = Number(v.replace(/\D/g, ''));
      if (!(n >= 1 && n <= 999999999)) { setErr('Статік — це число з гри, наприклад 12345.'); return; }
      setBusy(true); const m = await saveStatic(n); setBusy(false);
      if (m) setErr(m); else { setErr(''); onDone?.(); }
    }}>
      <label className="fld"><span>Статік (ID персонажа в грі)</span>
        <input inputMode="numeric" autoComplete="off" placeholder="наприклад 12345" value={v} onChange={e => { setV(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby="static-err" required />
      </label>
      {err && <small id="static-err" className="err" role="alert">{err}</small>}
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
        <h2 id="static-title">Вкажи свій статік</h2>
        <p className="muted note">Без статіка не можна оновлювати ціни: так інші гравці знають, хто їх вніс, а адмін може знайти тебе в грі. Статік бачиш лише ти й редактори сайту.</p>
        <StaticForm />
        <button type="button" className="btn ghost sm" onClick={signOut}>Вийти з акаунта</button>
      </div>
    </dialog>
  );
}
