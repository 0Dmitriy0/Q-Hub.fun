import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { money, parseMoney } from '../../lib/format';
import { MAX_CHARACTERS, parseCharacter } from '../../lib/character';

/* персонажі акаунта: у кожного свої Ім'я_Прізвище і статік (specs/025), не більше трьох; статік видно лише власнику */
export default function Characters({ first }: { first?: boolean }) {
  const { characters, reloadCharacters, setCurrent } = useAuth();
  const [name, setName] = useState(''); const [stat, setStat] = useState(''); const [start, setStart] = useState('');
  const [goalName, setGoalName] = useState(''); const [goal, setGoal] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const full = characters.length >= MAX_CHARACTERS;

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const c = parseCharacter(name, stat);
    if ('error' in c) { setMsg(c.error); return; }
    setBusy(true);
    const { data, error } = await supabase!.from('characters')
      .insert({ name: c.name, static_id: c.stat, start_balance: parseMoney(start), goal_name: goalName.trim(), goal: parseMoney(goal) }).select('id').single();
    setBusy(false);
    /* відмова бази (зайнятий статік, уже 3 персонажі) написана для гравця */
    if (error) { setMsg(error.code === 'P0001' ? error.message : 'Не вдалося створити персонажа. Спробуй ще раз.'); return; }
    await reloadCharacters(); setCurrent(data.id); setName(''); setStat(''); setStart(''); setGoalName(''); setGoal('');
  }

  return (
    <div className="grid side">
      <section className="card">
        <h2>{first ? 'Додай свого персонажа' : 'Новий персонаж'}</h2>
        {first && <p className="muted">У кожного персонажа свій облік, склад і гараж.</p>}
        {full ? <p className="muted">В акаунті вже {MAX_CHARACTERS} персонажі — більше не можна. Щоб додати нового, видали одного в «Скинути дані».</p> : <>
          <form className="form cols addchar" onSubmit={add}>
            <label className="fld">Ім'я_Прізвище, як у грі<input value={name} onChange={e => setName(e.target.value)} placeholder="Dmitriy_Core" maxLength={40} spellCheck={false} /></label>
            <label className="fld">Статік<input value={stat} onChange={e => setStat(e.target.value)} inputMode="numeric" placeholder="162183" maxLength={12} /></label>
            <label className="fld">Баланс у грі зараз, $<input value={start} onChange={e => setStart(e.target.value)} inputMode="numeric" placeholder="6 900 661" /></label>
            <label className="fld">На що збираєш<input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="Ubermacht I5" maxLength={60} /></label>
            <label className="fld">Скільки треба, $<input value={goal} onChange={e => setGoal(e.target.value)} inputMode="numeric" placeholder="13 000 000" /></label>
            <button className="btn acc" disabled={busy}>Додати персонажа</button>
          </form>
          {msg && <p className="err">{msg}</p>}
        </>}
      </section>
      {characters.length > 0 && (
        <section className="card">
          <h2>Твої персонажі</h2>
          <div className="list">{characters.map(c => (
            <div className="li" key={c.id}><div><b>{c.name}</b> <span className="mono muted">{c.static_id ? '#' + c.static_id : 'без статіку'}</span><br />
              <small>старт {money(c.start_balance)}{c.goal ? ' · ціль ' + (c.goal_name || '') + ' ' + money(c.goal) : ''}</small></div>
              <button className="btn sm" onClick={() => setCurrent(c.id)}>Обрати</button></div>))}</div>
        </section>
      )}
    </div>
  );
}
