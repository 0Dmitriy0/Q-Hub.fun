import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRows } from '../../lib/useRows';
import { balance } from '../../lib/ledger';
import { money, parseMoney, signed, when } from '../../lib/format';
import { TX_CATS } from '../../lib/cats';
import type { Character, Tx } from './types';

export default function LedgerPage({ c }: { c: Character }) {
  const { rows, error, reload } = useRows<Tx>('transactions', c.id);
  const [type, setType] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState(''); const [cat, setCat] = useState<string>(TX_CATS.in[0]); const [note, setNote] = useState('');
  const [real, setReal] = useState(''); const [msg, setMsg] = useState(''); const [sure, setSure] = useState('');
  const bal = balance(c.start_balance, rows);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const a = parseMoney(amount);
    if (!(a > 0)) { setMsg('Вкажи суму більше 0.'); return; }
    const { error } = await supabase!.from('transactions').insert({ character_id: c.id, type, amount: a, category: cat, note: note.trim() });
    if (error) { setMsg('Не вдалося записати.'); return; }
    setAmount(''); setNote(''); reload();
  }
  async function reconcile() {
    const r = parseMoney(real), diff = r - bal;
    if (!(r > 0) || !diff) { setMsg(diff ? 'Введи баланс із гри.' : 'Збігається з грою.'); return; }
    const { error } = await supabase!.from('transactions').insert({ character_id: c.id, type: diff > 0 ? 'in' : 'out', amount: Math.abs(diff), category: 'Коригування', note: 'Звірка з грою', source: 'reconcile' });
    if (error) { setMsg('Не вдалося звірити.'); return; }
    setReal(''); setMsg('Звірено: ' + signed(diff)); reload();
  }
  async function del(id: string) {
    if (sure !== id) { setSure(id); setTimeout(() => setSure(s => (s === id ? '' : s)), 3000); return; }
    await supabase!.from('transactions').delete().eq('id', id); setSure(''); reload();
  }

  return (
    <div className="grid side">
      <div className="grid">
        <section className="card">
          <h2>Новий запис</h2>
          <div className="seg" role="group" aria-label="Тип"><button type="button" aria-pressed={type === 'in'} onClick={() => { setType('in'); setCat(TX_CATS.in[0]); }}>Прибуток</button><button type="button" aria-pressed={type === 'out'} onClick={() => { setType('out'); setCat(TX_CATS.out[0]); }}>Витрата</button></div>
          <form className="form cols" onSubmit={add}>
            <label className="fld">Сума, $<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="150к або 150 000" /></label>
            <label className="fld">Категорія<select value={cat} onChange={e => setCat(e.target.value)}>{TX_CATS[type].map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="fld">Нотатка<input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="необов'язково" /></label>
            <button className="btn acc">Записати</button>
          </form>
          {msg && <p className={msg.startsWith('Звірено') || msg.startsWith('Збігається') ? 'ok' : 'err'}>{msg}</p>}
        </section>
        <section className="card">
          <div className="row between"><h2>Історія</h2><span className="muted">{rows.length} записів</span></div>
          {error && <p className="err">{error}</p>}
          {rows.length ? <div className="list">{rows.slice(0, 200).map(t => (
            <div className="li" key={t.id}>
              <div><b className={t.type === 'in' ? 'good' : 'bad'}>{signed(t.type === 'in' ? t.amount : -t.amount)}</b> · {t.category}<br /><small>{when(t.ts)}{t.note ? ' · ' + t.note : ''}</small></div>
              <button className="btn sm ghost" onClick={() => del(t.id)}>{sure === t.id ? 'Так, видалити' : 'Видалити'}</button>
            </div>))}</div> : <div className="empty">Записів ще немає.</div>}
        </section>
      </div>
      <section className="card">
        <span className="lbl">Баланс в обліку</span>
        <div className="big" style={{ fontSize: 30 }}>{money(bal)}</div>
        <h3>Звірка з грою</h3>
        <p className="muted">Введи суму з гри (готівка + банк). Різниця запишеться як коригування.</p>
        <div className="row"><label className="fld" style={{ flex: 1 }}><span>Баланс у грі</span><input value={real} onChange={e => setReal(e.target.value)} inputMode="numeric" /></label><button className="btn" onClick={reconcile}>Звірити</button></div>
      </section>
    </div>
  );
}
