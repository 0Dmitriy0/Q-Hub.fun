import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { parseHubBackup, type HubImport } from '../../lib/importHub';
import { money } from '../../lib/format';
import Select from '../../components/Select';

/* Імпорт копії Quant Hub. Порядок: персонаж → облік → угоди (з посиланням на транзакції й чеки) → гараж, документи, сесії.
   upsert з ignoreDuplicates за (character_id, external_id): повторний імпорт того самого файлу нічого не дублює. */
export default function ImportPage() {
  const { characters, reloadCharacters, setCurrent } = useAuth();
  const [data, setData] = useState<HubImport | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [name, setName] = useState(''); const [target, setTarget] = useState('new');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState('');

  async function onFile(f: File | undefined) {
    setMsg(''); setDone(''); setData(null);
    if (!f) return;
    try { const j = JSON.parse(await f.text()); setRaw(j); setData(parseHubBackup(j, name || 'Персонаж')); }
    catch (e) { setMsg(e instanceof Error && e.message.includes('Quant Hub') ? e.message + '. Збережи копію кнопкою «Зберегти копію» в хабі.' : 'Не вдалося прочитати файл.'); }
  }

  async function run() {
    if (!data || !supabase) return;
    setBusy(true); setMsg('');
    const sb = supabase;
    try {
      const d = parseHubBackup(raw, name || 'Персонаж');
      let cid = target;
      if (target === 'new') {
        const { data: ch, error } = await sb.from('characters').insert(d.character).select('id').single();
        if (error) throw error; cid = ch.id;
      }
      const up = async (table: string, rows: object[]) => {
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await sb.from(table).upsert(rows.slice(i, i + 500).map(r => ({ ...r, character_id: cid })), { onConflict: 'character_id,external_id', ignoreDuplicates: true });
          if (error) throw error;
        }
      };
      await up('transactions', d.transactions);
      const { data: txs } = await sb.from('transactions').select('id,external_id').eq('character_id', cid).not('external_id', 'is', null).limit(20000);
      const txMap = new Map((txs || []).map(t => [t.external_id as string, t.id as string]));
      const receipts = new Map<string, string>();
      await up('deals', d.deals.map(({ tx_external_id, receipt_key, ...x }) => ({
        ...x,
        tx_id: tx_external_id ? txMap.get(tx_external_id) ?? null : null,
        receipt_id: receipt_key ? (receipts.get(receipt_key) ?? (receipts.set(receipt_key, crypto.randomUUID()), receipts.get(receipt_key)!)) : null
      })));
      await up('cars', d.cars);
      await up('documents', d.documents);
      await up('game_sessions', d.sessions);
      await reloadCharacters(); setCurrent(cid);
      setDone(`Перенесено: ${d.counts.transactions} записів обліку, ${d.counts.deals} угод, ${d.counts.cars} авто, ${d.counts.documents} документів, ${d.counts.sessions} сесій.`);
    } catch { setMsg('Імпорт зупинився з помилкою. Те, що вже перенеслось, лишилось; запусти ще раз — дублів не буде.'); }
    setBusy(false);
  }

  return (
    <section className="card">
      <h2>Імпорт з Quant Hub</h2>
      <ol className="steps">
        <li><span>У хабі на claude.ai натисни «Зберегти копію» — завантажиться <span className="mono">quant-hub-РРРР-ММ-ДД.json</span>.</span></li>
        <li><span>Обери цей файл нижче і перевір, що знайдено.</span></li>
        <li><span>Натисни «Перенести». Повторний імпорт того самого файлу нічого не дублює.</span></li>
      </ol>
      <div className="form cols">
        <label className="fld">Куди<Select value={target} onChange={setTarget} options={[{ value: 'new', label: 'Новий персонаж', icon: 'user' }, ...characters.map(c => ({ value: c.id, label: c.name, icon: 'user' }))]} /></label>
        {target === 'new' && <label className="fld">Ім'я персонажа<input value={name} onChange={e => setName(e.target.value)} placeholder="Dmitriy_Core" maxLength={40} /></label>}
        <label className="fld">Файл копії<input type="file" accept="application/json,.json" onChange={e => onFile(e.target.files?.[0])} /></label>
      </div>
      {data && <div className="card" style={{ background: 'var(--surface2)' }}>
        <b>Знайдено</b>
        <span className="muted">Облік: {data.counts.transactions} · Угоди: {data.counts.deals} · Гараж: {data.counts.cars} · Документи: {data.counts.documents} · Сесії: {data.counts.sessions}</span>
        {target === 'new' && <span className="muted">Старт обліку {money(data.character.start_balance)}{data.character.goal ? ' · ціль ' + data.character.goal_name + ' ' + money(data.character.goal) : ''}</span>}
        <div className="row"><button className="btn acc" disabled={busy || (target === 'new' && !name.trim())} onClick={run}>{busy ? 'Переношу…' : 'Перенести'}</button>{target === 'new' && !name.trim() && <span className="muted">вкажи ім'я персонажа</span>}</div>
      </div>}
      {msg && <p className="err">{msg}</p>}
      {done && <p className="ok">{done}</p>}
    </section>
  );
}
