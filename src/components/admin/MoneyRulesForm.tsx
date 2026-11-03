import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fmt, parseMoney } from '../../lib/format';

/* пороги «Заробітку» (specs/044, money_rules): змінює лише admin (RLS); програма підхоплює раз на годину, без релізу */
interface Rules { max_jump: number; min_minutes: number }

export default function MoneyRulesForm() {
  const [r, setR] = useState<Rules | null>(null);
  const [jump, setJump] = useState('');
  const [min, setMin] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase!.from('money_rules').select('max_jump, min_minutes').maybeSingle().then(({ data }) => {
      if (data) { setR(data as Rules); setJump(fmt(data.max_jump)); setMin(String(data.min_minutes)); }
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const max_jump = parseMoney(jump), min_minutes = Number(min);
    if (!(max_jump >= 100000 && max_jump <= 1e9)) { setMsg('Стрибок — від 100 000 до 1 000 000 000 $.'); return; }
    if (!(Number.isInteger(min_minutes) && min_minutes >= 1 && min_minutes <= 120)) { setMsg('Тривалість — ціле число від 1 до 120 хв.'); return; }
    setBusy(true);
    const { error } = await supabase!.from('money_rules').update({ max_jump, min_minutes }).eq('id', true);
    setBusy(false);
    if (error) { setMsg('Не вдалося зберегти пороги — перевір, що в тебе роль admin.'); return; }
    setR({ max_jump, min_minutes }); setMsg('Збережено. Програма підхопить протягом години.');
  }

  if (!r) return <p className="muted">Пороги ще не завантажено (міграція 0049 застосована?).</p>;
  return (
    <form className="form cols" onSubmit={save}>
      <label className="fld">Сумнівний стрибок балансу за одне зчитування, $
        <input inputMode="numeric" value={jump} onChange={e => setJump(e.target.value)} onBlur={() => setJump(fmt(parseMoney(jump)))} />
        <small className="muted">Більша зміна не йде в «Заробив», сеанс позначається «сумнівне зчитування».</small></label>
      <label className="fld">Мінімальна тривалість сеансу, хв
        <input type="number" min={1} max={120} step={1} value={min} onChange={e => setMin(e.target.value)} />
        <small className="muted">Коротші сеанси не входять у середнє за годину.</small></label>
      <button className="btn acc" disabled={busy}>Зберегти пороги</button>
      {msg && <p className={msg.startsWith('Збережено') ? 'good' : 'err'}>{msg}</p>}
    </form>
  );
}
