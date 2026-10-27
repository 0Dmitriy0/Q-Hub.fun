import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRows } from '../../lib/useRows';
import { balances } from '../../lib/ledger';
import { useAuth } from '../../lib/auth';
import { canEdit } from '../../lib/app';
import { balanceSeries, lastDays, summary, type Period } from '../../lib/ledgerStats';
import { money, parseMoney, signed, when } from '../../lib/format';
import { ACCOUNTS, TX_CATS, defaultAccount, type Account } from '../../lib/cats';
import { BalanceChart, DaysChart } from '../../components/Charts';
import { hm, perHour, played, type GameSession } from '../../lib/sessions';
import type { Character, Tx } from './types';
import Select from '../../components/Select';

const FEW = 8;   // скільки останніх записів історії видно без «Показати все»
const PERIODS: [Period, string][] =[['all', 'Усе'], ['today', 'Сьогодні'], ['yesterday', 'Вчора'], ['week', '7 днів'], ['month', '30 днів']];

/* кільце цілі: дуга від верху за годинниковою стрілкою */
function Ring({ pct }: { pct: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 84 84" role="img" aria-label={`Ціль: ${pct.toFixed(1)}%`}>
      <circle cx="42" cy="42" r={r} className="ring-bg" />
      <circle cx="42" cy="42" r={r} className="ring-fg" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="46" textAnchor="middle">{pct.toFixed(1)}%</text>
    </svg>
  );
}

function Cats({ title, rows, cls }: { title: string; rows: [string, number][]; cls: string }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return (
    <div className="grid" style={{ gap: 6 }}>
      <h3>{title}</h3>
      {rows.length ? rows.map(([k, v]) => (
        <div className="catrow" key={k}><span>{k}</span><b className="mono">{money(v)}</b><i className={cls} style={{ width: (v / max) * 100 + '%' }} /></div>
      )) : <small className="muted">Немає записів за цей період.</small>}
    </div>
  );
}

/* облік як у Quant Hub: баланс і ціль, картки дня, графіки, підсумки за періодами, звірка, новий запис, історія */
export default function LedgerPage({ c }: { c: Character }) {
  const { rows, error, reload } = useRows<Tx>('transactions', c.id);
  const games = useRows<GameSession>('game_sessions', c.id, 'started_at', false).rows;
  const { reloadCharacters } = useAuth();
  const [type, setType] = useState<'in' | 'out' | 'move'>('in');
  const [amount, setAmount] = useState(''); const [cat, setCat] = useState<string>(TX_CATS.in[0]); const [note, setNote] = useState('');
  /* рахунок: за категорією, поки гравець сам не перемкнув */
  const [acc, setAcc] = useState<Account | null>(null);
  const account: Account = acc ?? defaultAccount(cat);
  const [dir, setDir] = useState<'card-cash' | 'cash-card'>('card-cash');
  const [realCash, setRealCash] = useState(''); const [realCard, setRealCard] = useState('');
  const [msg, setMsg] = useState(''); const [sure, setSure] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  /* історія: у програмі — останні FEW і «Показати все»; на сайті кнопки вимкнено (fieldset), тож одразу все */
  const [all, setAll] = useState(!canEdit);
  const b = balances(c, rows), bal = b.total;
  const today = summary(rows, 'today'), sum = summary(rows, period);
  const todayMs = played(games, 'today'), sumMs = played(games, period);
  const ph = (net: number, ms: number) => { const v = perHour(net, ms); return v === null ? '—' : signed(v); };
  const pct = c.goal ? Math.min(100, Math.max(0, bal / c.goal * 100)) : 0;

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const a = parseMoney(amount);
    if (!(a > 0)) { setMsg('Вкажи суму більше 0.'); return; }
    if (type === 'move') {
      /* переказ — пара записів з одним часом: мінус з одного рахунку, плюс на інший */
      const [from, to]: Account[] = dir === 'card-cash' ? ['card', 'cash'] : ['cash', 'card'];
      const ts = new Date().toISOString(), base = { character_id: c.id, amount: a, category: 'Переказ', note: note.trim() || `${ACCOUNTS[from]} → ${ACCOUNTS[to]}`, source: 'transfer', ts };
      const { error } = await supabase!.from('transactions').insert([{ ...base, type: 'out', account: from }, { ...base, type: 'in', account: to }]);
      if (error) { setMsg('Не вдалося записати переказ.'); return; }
    } else {
      const { error } = await supabase!.from('transactions').insert({ character_id: c.id, type, amount: a, category: cat, note: note.trim(), account });
      if (error) { setMsg('Не вдалося записати.'); return; }
    }
    setAmount(''); setNote(''); reload();
  }
  /* звірка з грою окремо готівкою й банком. Уперше (картки в обліку ще не було) банк стає стартом картки —
     це не прибуток, а розподіл того, що вже було; далі різниця пишеться коригуванням на свій рахунок */
  async function reconcile() {
    setMsg('');
    const cash = realCash.trim() ? parseMoney(realCash) : null, card = realCard.trim() ? parseMoney(realCard) : null;
    if (cash === null && card === null) { setMsg('Введи готівку чи банк із гри.'); return; }
    /* готівка в обліку після кроку з карткою: розподіл старту забирає її частину, коригування картки — ні */
    let cashNow = b.cash;
    const done: string[] = [];
    const fix = async (acct: Account, diff: number) => {
      if (!diff) return true;
      const { error } = await supabase!.from('transactions').insert({ character_id: c.id, type: diff > 0 ? 'in' : 'out', amount: Math.abs(diff), category: 'Коригування', note: 'Звірка з грою', source: 'reconcile', account: acct });
      if (!error) done.push(`${ACCOUNTS[acct].toLowerCase()} ${signed(diff)}`);
      return !error;
    };
    if (card !== null) {
      const first = !Number(c.start_card) && !rows.some(t => t.account === 'card');
      if (first) {
        const { error } = await supabase!.from('characters').update({ start_card: card }).eq('id', c.id);
        if (error) { setMsg('Не вдалося зберегти. Запусти міграцію 0017 (готівка й картка) у Supabase.'); return; }
        cashNow = bal - card; done.push('картку розділено');
      } else if (!(await fix('card', card - b.card))) { setMsg('Не вдалося звірити.'); return; }
    }
    if (cash !== null && !(await fix('cash', cash - cashNow))) { setMsg('Не вдалося звірити.'); return; }
    setRealCash(''); setRealCard(''); setMsg(done.length ? 'Звірено: ' + done.join(', ') : 'Збігається з грою.');
    await reloadCharacters(); reload();
  }
  async function del(t: Tx) {
    if (sure !== t.id) { setSure(t.id); setTimeout(() => setSure(s => (s === t.id ? '' : s)), 3000); return; }
    /* переказ видаляється парою — інакше один рахунок «загубить» гроші */
    if (t.source === 'transfer') await supabase!.from('transactions').delete().eq('character_id', c.id).eq('source', 'transfer').eq('ts', t.ts);
    else await supabase!.from('transactions').delete().eq('id', t.id);
    setSure(''); reload();
  }

  return (
    <>
      <section className="card hero">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="grid" style={{ gap: 8 }}>
            <span className="lbl">Поточний баланс</span>
            <div className="big">{money(bal)}</div>
            <div className="row"><span className="pill">{signed(today.net)} сьогодні</span><span className="muted">Старт {money(c.start_balance)}</span></div>
            <div className="accs"><div><small>Готівка</small><b className="mono">{money(b.cash)}</b></div><div><small>Картка</small><b className="mono">{money(b.card)}</b></div></div>
          </div>
          {c.goal > 0 && <div className="row"><Ring pct={pct} /><div><span className="lbl">Ціль</span><br /><b>{c.goal_name || 'Ціль'}</b><br /><span className="mono">{money(c.goal)}</span><br /><small className="muted">Залишилось <b>{money(Math.max(0, c.goal - bal))}</b></small></div></div>}
        </div>
      </section>
      <div className="stat4">
        <section className="card"><span className="lbl">Прибуток сьогодні</span><b className="big good" style={{ fontSize: 24 }}>{money(today.in)}</b></section>
        <section className="card"><span className="lbl">Витрати сьогодні</span><b className="big bad" style={{ fontSize: 24 }}>{money(today.out)}</b></section>
        <section className="card"><span className="lbl">Відіграно сьогодні</span><b className="big" style={{ fontSize: 24 }}>{hm(todayMs)}</b></section>
        <section className="card"><span className="lbl">Чистий за годину гри</span><b className="big" style={{ fontSize: 24 }}>{ph(today.net, todayMs)}</b>{!todayMs && <small className="muted">з’явиться, коли програма побачить гру</small>}</section>
      </div>
      <div className="grid side">
        <div className="grid">
          <section className="card edit-only">
            <h2>Звірка балансу</h2>
            {msg && <p className={msg.startsWith('Звірено') || msg.startsWith('Збігається') ? 'ok' : 'err'}>{msg}</p>}
            <p className="muted">Введи, скільки в грі готівкою і на картці. Можна одне з двох. Уперше картка просто розділить нинішній баланс, далі різниця запишеться коригуванням.</p>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="fld" style={{ flex: 1 }}><span>Готівка в грі, $</span><input value={realCash} onChange={e => setRealCash(e.target.value)} inputMode="numeric" placeholder={String(b.cash)} /></label>
              <label className="fld" style={{ flex: 1 }}><span>Банк у грі, $</span><input value={realCard} onChange={e => setRealCard(e.target.value)} inputMode="numeric" placeholder={String(b.card)} /></label>
              <button className="btn acc" onClick={reconcile}>Звірити</button></div>
          </section>
          <section className="card edit-only">
            <h2>Новий запис</h2>
            <div className="seg" role="group" aria-label="Тип"><button type="button" aria-pressed={type === 'in'} onClick={() => { setType('in'); setCat(TX_CATS.in[0]); setAcc(null); }}>Прибуток</button><button type="button" aria-pressed={type === 'out'} onClick={() => { setType('out'); setCat(TX_CATS.out[0]); setAcc(null); }}>Витрата</button><button type="button" aria-pressed={type === 'move'} onClick={() => setType('move')}>Переказ</button></div>
            <form className="form" onSubmit={add}>
              <label className="fld">Сума, $<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="150к або 150 000" /></label>
              {type === 'move' ? (
                <div className="fld"><span>Куди</span><div className="seg sm" role="group" aria-label="Напрям переказу"><button type="button" aria-pressed={dir === 'card-cash'} onClick={() => setDir('card-cash')}>Зняв з картки</button><button type="button" aria-pressed={dir === 'cash-card'} onClick={() => setDir('cash-card')}>Поклав на картку</button></div></div>
              ) : <>
                <label className="fld">Категорія<Select value={cat} onChange={v => { setCat(v); setAcc(null); }} options={TX_CATS[type].map(x => ({ value: x, label: x }))} /></label>
                <div className="fld"><span>Рахунок</span><div className="seg sm" role="group" aria-label="Рахунок">{(Object.keys(ACCOUNTS) as Account[]).map(k => <button type="button" key={k} aria-pressed={account === k} onClick={() => setAcc(k)}>{ACCOUNTS[k]}</button>)}</div></div>
              </>}
              <label className="fld">Нотатка<input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="квест сім'ї, продаж Gladiator…" /></label>
              <button className="btn acc">Записати</button>
            </form>
          </section>
          {/* історія — у лівій колонці під формою (там було порожньо): спершу останні, «Показати все» — решта */}
          <section className="card">
            <div className="row between"><h2>Історія</h2><span className="muted">{rows.length} записів</span></div>
            {error && <p className="err">{error}</p>}
            {rows.length ? <div className="list">{rows.slice(0, all ? 200 : FEW).map(t => (
              <div className="li" key={t.id}>
                <div><b className={t.source === 'transfer' ? '' : t.type === 'in' ? 'good' : 'bad'}>{signed(t.type === 'in' ? t.amount : -t.amount)}</b> · {t.category} <span className="pill">{ACCOUNTS[t.account ?? 'cash']}</span><br /><small>{when(t.ts)}{t.note ? ' · ' + t.note : ''}</small></div>
                <button className="btn sm ghost edit-only" onClick={() => del(t)}>{sure === t.id ? (t.source === 'transfer' ? 'Так, обидва записи' : 'Так, видалити') : 'Видалити'}</button>
              </div>))}</div> : <div className="empty">Записів ще немає. Додай перший прибуток або витрату — дата й час проставляться самі.</div>}
            {canEdit && rows.length > FEW && <button className="btn ghost sm" style={{ alignSelf: 'center' }} aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Сховати' : `Показати все (${Math.min(rows.length, 200)})`}</button>}
          </section>
        </div>
        <div className="grid">
          <section className="card"><h2>Баланс у часі</h2><BalanceChart pts={balanceSeries(c.start_balance, rows)} /></section>
          <section className="card">
            <div className="row between"><h2>Останні 7 днів</h2><span className="legend"><span><i className="sw in" />прибуток</span><span><i className="sw out" />витрати</span></span></div>
            <DaysChart days={lastDays(rows)} />
          </section>
          <section className="card">
            <h2>Підсумки</h2>
            <div className="tabs"><div className="seg sm" role="group" aria-label="Період">{PERIODS.map(([k, l]) => <button key={k} type="button" aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}</div></div>
            <div className="trip">
              <div><small>Прибуток</small><b className="mono good">{money(sum.in)}</b></div>
              <div><small>Витрати</small><b className="mono bad">{money(sum.out)}</b></div>
              <div><small>Чистий результат</small><b className="mono">{signed(sum.net)}</b></div>
              <div><small>Відіграно</small><b className="mono">{hm(sumMs)}</b></div>
              <div><small>Чистий за годину</small><b className="mono">{ph(sum.net, sumMs)}</b></div>
            </div>
            <Cats title="Прибуток за категоріями" rows={sum.catsIn} cls="ch-in" />
            <Cats title="Витрати за категоріями" rows={sum.catsOut} cls="ch-out" />
          </section>
        </div>
      </div>
    </>
  );
}
