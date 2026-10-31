import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRows } from '../../lib/useRows';
import { DOC_KINDS, docState, iconFor, plusDays, sortDocs, stateText, type Doc } from '../../lib/documents';
import Icon from '../../components/Icon';
import type { Character } from './types';

const PILL = { expired: 'bad', soon: 'warn', ok: 'good', none: '' } as const;

/* документи персонажа: що є й коли закінчується. На сайті — лише перегляд (форми й кнопки — edit-only) */
export default function DocumentsPage({ c }: { c: Character }) {
  const { rows, error, reload } = useRows<Doc>('documents', c.id, 'name', true);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', expires: '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [sure, setSure] = useState('');
  const docs = sortDocs(rows);
  const due = docs.filter(d => { const k = docState(d.expires).kind; return k === 'expired' || k === 'soon'; }).length;
  const taken = new Set(rows.map(r => r.name));

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const name = f.name.trim();
    if (!name) { setMsg('Вкажи назву документа.'); return; }
    setBusy(true);
    const { error } = await supabase!.from('documents').insert({ character_id: c.id, name, icon: iconFor(name), expires: f.expires || null });
    setBusy(false);
    if (error) { setMsg('Не вдалося додати документ.'); return; }
    setF({ name: '', expires: '' }); setAdding(false); reload();
  }
  async function setExpires(d: Doc, expires: string | null) {
    setMsg('');
    const { error } = await supabase!.from('documents').update({ expires }).eq('id', d.id);
    if (error) setMsg('Не вдалося змінити строк.');
    reload();
  }
  async function del(d: Doc) {
    if (sure !== d.id) { setSure(d.id); setTimeout(() => setSure(s => (s === d.id ? '' : s)), 3000); return; }
    await supabase!.from('documents').delete().eq('id', d.id);
    setSure(''); reload();
  }

  return (
    <>
      <section className="card hero">
        <div className="row between">
          <div><span className="lbl">Документи</span><div className="big" style={{ fontSize: 30 }}>{rows.length}</div>
            {due > 0 ? <span className="warn">потребують продовження: {due}</span> : rows.length > 0 && <span className="muted">усі діють</span>}</div>
          <button className="btn acc edit-only" onClick={() => setAdding(a => !a)}>{adding ? 'Сховати' : '+ Додати документ'}</button>
        </div>
        {adding && (
          <form className="form cols edit-only" onSubmit={add}>
            <label className="fld">Документ<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} list="doc-kinds" maxLength={60} placeholder="Водійське посвідчення" autoFocus /></label>
            <datalist id="doc-kinds">{DOC_KINDS.filter(([n]) => !taken.has(n)).map(([n]) => <option key={n} value={n} />)}</datalist>
            <label className="fld">Діє до (включно)<input type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} /></label>
            <div className="fld"><span>Або на</span><div className="row">{[7, 14, 30].map(n => <button key={n} type="button" className="btn sm ghost" onClick={() => setF({ ...f, expires: plusDays(n) })}>{n} днів</button>)}
              <button type="button" className="btn sm ghost" onClick={() => setF({ ...f, expires: '' })}>Безстроковий</button></div></div>
            <button className="btn acc" disabled={busy}>Додати</button>
          </form>
        )}
        {msg && <p className="err">{msg}</p>}
      </section>
      {error && <p className="err">{error}</p>}
      {docs.length ? <div className="list cards">{docs.map(d => {
        const s = docState(d.expires);
        return (
          <div className="card doc" key={d.id}>
            <div className="row between">
              <div className="row"><span className="ibub"><Icon name={d.icon || iconFor(d.name)} /></span><div><b>{d.name}</b><br /><span className={'pill ' + PILL[s.kind]}>{stateText(d.expires)}</span></div></div>
              <div className="row edit-only">
                {d.expires && <>
                  <button className="btn sm ghost" onClick={() => setExpires(d, plusDays(7, d.expires))}>+7 днів</button>
                  <button className="btn sm ghost" onClick={() => setExpires(d, plusDays(30, d.expires))}>+30 днів</button>
                </>}
                <input type="date" className="doc-date" value={d.expires || ''} onChange={e => setExpires(d, e.target.value || null)} aria-label={'Діє до: ' + d.name} title="Змінити дату" />
                <button className="btn sm ghost" onClick={() => del(d)}>{sure === d.id ? 'Так, видалити' : 'Видалити'}</button>
              </div>
            </div>
          </div>
        );
      })}</div> : <div className="card empty">Документів ще немає.<span className="edit-only"> Додай перший — і кабінет нагадає, коли строк закінчуватиметься.</span></div>}
    </>
  );
}
