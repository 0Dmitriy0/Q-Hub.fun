import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { money, parseMoney } from '../../lib/format';

export default function Characters({ first }: { first?: boolean }) {
  const { characters, reloadCharacters, setCurrent } = useAuth();
  const [name, setName] = useState(''); const [start, setStart] = useState(''); const [goalName, setGoalName] = useState(''); const [goal, setGoal] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!name.trim()) { setMsg('Вкажи ім\'я персонажа, як у грі.'); return; }
    setBusy(true);
    const { data, error } = await supabase!.from('characters').insert({ name: name.trim(), start_balance: parseMoney(start), goal_name: goalName.trim(), goal: parseMoney(goal) }).select('id').single();
    setBusy(false);
    if (error) { setMsg('Не вдалося створити персонажа. Спробуй ще раз.'); return; }
    await reloadCharacters(); setCurrent(data.id); setName(''); setStart(''); setGoalName(''); setGoal('');
  }

  return (
    <div className="grid side">
      <section className="card">
        <h2>{first ? 'Додай свого персонажа' : 'Новий персонаж'}</h2>
        {first && <p className="muted">У кожного персонажа свій облік, склад і гараж. Вже користувався Quant Hub? Створи персонажа через <Link to="/kabinet/import">імпорт копії</Link> — перенесеться все.</p>}
        <form className="form cols" onSubmit={add}>
          <label className="fld">Ім'я в грі<input value={name} onChange={e => setName(e.target.value)} placeholder="Dmitriy_Core" maxLength={40} /></label>
          <label className="fld">Баланс зараз (готівка + банк)<input value={start} onChange={e => setStart(e.target.value)} inputMode="numeric" placeholder="6 900 661" /></label>
          <label className="fld">Ціль<input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="Ubermacht I5" maxLength={60} /></label>
          <label className="fld">Сума цілі<input value={goal} onChange={e => setGoal(e.target.value)} inputMode="numeric" placeholder="13 000 000" /></label>
          <button className="btn acc" disabled={busy}>Додати персонажа</button>
        </form>
        {msg && <p className="err">{msg}</p>}
      </section>
      {characters.length > 0 && (
        <section className="card">
          <h2>Твої персонажі</h2>
          <div className="list">{characters.map(c => (
            <div className="li" key={c.id}><div><b>{c.name}</b><br /><small>старт {money(c.start_balance)}{c.goal ? ' · ціль ' + (c.goal_name || '') + ' ' + money(c.goal) : ''}</small></div>
              <button className="btn sm" onClick={() => setCurrent(c.id)}>Обрати</button></div>))}</div>
        </section>
      )}
    </div>
  );
}
