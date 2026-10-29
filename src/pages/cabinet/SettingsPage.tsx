import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { NickForm } from '../../components/NickGate';
import Characters from './Characters';
import type { Character } from './types';

/* таблиці з даними персонажа; deals першими — вони посилаються на transactions */
const OWN_TABLES = ['deals', 'transactions', 'cars', 'documents', 'game_sessions'];
const WORD = 'СКИНУТИ';

type Mode = 'char' | 'del' | 'all';

/* Налаштування: нік і статік, персонажі, скидання даних. Скидання — лише після введення слова підтвердження;
   RLS у базі дозволяє видаляти тільки свої рядки, персонажі видаляються разом з усім (on delete cascade) */
export default function SettingsPage({ c }: { c: Character }) {
  const { session, reloadCharacters } = useAuth();
  const [mode, setMode] = useState<Mode | null>(null);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [saved, setSaved] = useState(false);

  function ask(m: Mode) { setMode(m); setWord(''); setMsg(''); }

  async function reset() {
    if (!supabase || !session || !mode || word.trim().toUpperCase() !== WORD) return;
    setBusy(true); setMsg('');
    let failed = false;
    if (mode === 'char') {
      for (const t of OWN_TABLES) {
        const { error } = await supabase.from(t).delete().eq('character_id', c.id);
        if (error) { failed = true; break; }
      }
    } else if (mode === 'del') {
      /* персонаж разом з усім своїм (on delete cascade); ціни для скупників лишаються */
      const { error } = await supabase.from('characters').delete().eq('id', c.id);
      failed = !!error;
    } else {
      const { error } = await supabase.from('characters').delete().eq('owner', session.user.id);
      failed = !!error;
    }
    setBusy(false);
    if (failed) { setMsg('Не вдалося скинути дані. Перевір інтернет і спробуй ще раз — те, що встигло видалитись, не повернеться.'); return; }
    setMsg(mode === 'char' ? `Облік, угоди, склад і гараж персонажа ${c.name} очищено.` : mode === 'del' ? `Персонажа ${c.name} видалено разом з його даними.` : 'Усі персонажі й їхні дані видалено. Можна починати з чистого листа.');
    setMode(null); setWord('');
    await reloadCharacters();
  }

  return (
    <>
      <section className="card">
        <h2>Нік у Q-Hub</h2>
        <p className="muted">Під ним тебе бачать на сайті: у рейтингу й біля цін. Змінювати — раз на 30 днів. Ім'я_Прізвище й статік — у кожного персонажа свої, нижче.</p>
        <NickForm onDone={() => setSaved(true)} />
        {saved && <p className="good" role="status">Збережено.</p>}
      </section>

      <Characters />

      <section className="card danger-zone">
        <h2>Скинути дані</h2>
        <p className="muted">Видалене не відновити. Ціни, які ти надсилав для скупників, лишаються — вони спільні для всіх гравців.</p>
        <div className="list">
          <div className="li">
            <div><b>Очистити персонажа {c.name}</b><br /><small>Облік, угоди, склад, гараж, документи й сесії. Сам персонаж, його старт і ціль лишаються.</small></div>
            <button type="button" className="btn sm bad" onClick={() => ask('char')}>Очистити</button>
          </div>
          <div className="li">
            <div><b>Видалити персонажа {c.name}</b><br /><small>Сам персонаж разом з обліком, угодами, складом і гаражем. Інші персонажі лишаються.</small></div>
            <button type="button" className="btn sm bad" onClick={() => ask('del')}>Видалити</button>
          </div>
          <div className="li">
            <div><b>Видалити всіх персонажів</b><br /><small>Усі персонажі разом з усіма даними. Акаунт, нік і статік лишаються.</small></div>
            <button type="button" className="btn sm bad" onClick={() => ask('all')}>Видалити все</button>
          </div>
        </div>
        {mode && (
          <form className="form" onSubmit={e => { e.preventDefault(); reset(); }}>
            <label className="fld">Щоб підтвердити, введи слово {WORD}
              <input value={word} onChange={e => setWord(e.target.value)} autoComplete="off" autoFocus />
            </label>
            <div className="row">
              <button className="btn bad" disabled={busy || word.trim().toUpperCase() !== WORD}>
                {busy ? 'Видаляю…' : mode === 'char' ? `Очистити ${c.name}` : mode === 'del' ? `Видалити ${c.name}` : 'Видалити всіх персонажів'}
              </button>
              <button type="button" className="btn ghost" onClick={() => setMode(null)} disabled={busy}>Скасувати</button>
            </div>
          </form>
        )}
        {msg && <p className={msg.startsWith('Не вдалося') ? 'err' : 'good'} role="status">{msg}</p>}
      </section>
    </>
  );
}
