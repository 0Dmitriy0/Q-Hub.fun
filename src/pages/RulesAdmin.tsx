import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import Select from '../components/Select';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { when } from '../lib/format';
import { KINDS, diffText, normalizeSourceUrl, type RuleKind } from '../lib/ruleSources';

/* Джерела правил сервера й законів штату (specs/010 US3, адреса /admin/pravyla). Адмін додає посилання на розділ чи тему
   форуму з типом, вмикає й вимикає, видаляє і тисне «Оновити зараз» — функція rules-sync збирає новий знімок, який програма
   підхоплює сама. Права — у базі (0039): усе це бачить і змінює лише admin */
interface Source { id: number; url: string; kind: RuleKind; enabled: boolean; title: string | null; items: number; synced_at: string | null; error: string | null; diff: { added: number; changed: number; removed: number } | null }
const KIND = Object.fromEntries(KINDS) as Record<RuleKind, string>;
const short = (u: string) => decodeURIComponent(u.replace('https://forum.quant5.com.ua/index.php?/', '')).replace(/\/$/, '');

export default function RulesAdmin() {
  const { ready, role } = useAuth();
  const [list, setList] = useState<Source[] | null>(null);
  const [url, setUrl] = useState(''); const [kind, setKind] = useState<RuleKind>('rules');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const load = () => supabase?.from('rule_sources').select('id,url,kind,enabled,title,items,synced_at,error,diff').order('id')
    .then(({ data, error }) => setList(error ? [] : (data as Source[])));
  useEffect(() => { if (role === 'admin') load(); }, [role]);

  if (!ready) return <div className="card empty">Завантаження…</div>;
  if (role !== 'admin') return <div className="card empty">Сторінка лише для адміністратора.</div>;
  const dbErr = (e: { code?: string; message: string }, fallback: string) =>
    e.code === '23505' ? 'Це джерело вже є в списку.' : e.code === '23514' ? 'Адреса — лише розділ чи тема форуму сервера.' : e.code === 'P0001' ? e.message : fallback;

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const u = normalizeSourceUrl(url);
    if ('error' in u) { setMsg({ text: u.error, bad: true }); return; }
    setBusy('add');
    const { error } = await supabase!.from('rule_sources').insert({ url: u.url, kind });
    setBusy('');
    if (error) { setMsg({ text: dbErr(error, 'Не вдалося додати джерело.'), bad: true }); return; }
    setUrl(''); setMsg({ text: 'Додано. Натисни «Оновити зараз», щоб пункти з’явилися в програмі.' }); load();
  }
  async function toggle(s: Source) {
    const { error } = await supabase!.from('rule_sources').update({ enabled: !s.enabled }).eq('id', s.id);
    if (error) setMsg({ text: dbErr(error, 'Не вдалося змінити джерело.'), bad: true }); else load();
  }
  async function remove(s: Source) {
    if (!confirm(`Видалити джерело «${s.title || short(s.url)}»? Його пункти зникнуть з програми після наступного оновлення.`)) return;
    const { error } = await supabase!.from('rule_sources').delete().eq('id', s.id);
    if (error) setMsg({ text: dbErr(error, 'Не вдалося видалити джерело.'), bad: true }); else load();
  }
  async function sync() {
    setBusy('sync'); setMsg({ text: 'Оновлюю з форуму — це хвилина-дві…' });
    const { data, error } = await supabase!.functions.invoke('rules-sync', { body: {} });
    setBusy('');
    if (error) { setMsg({ text: 'Оновити не вдалося: ' + (data?.error || error.message), bad: true }); load(); return; }
    const bad = (data.sources as { error: string | null }[]).filter(s => s.error).length;
    setMsg({ text: `Готово: ${data.topics} тем, ${data.items} пунктів.` + (bad ? ` Джерел з помилкою: ${bad} — їхні пункти лишились з минулого разу.` : ''), bad: !!bad });
    load();
  }

  return (
    <div className="cab">
      <section className="card">
        <div className="row between"><h1 className="ih"><Icon name="book" />Джерела правил</h1>
          <button type="button" className="btn acc" disabled={!!busy} onClick={sync}>{busy === 'sync' ? 'Оновлюю…' : 'Оновити зараз'}</button></div>
        <p className="muted">Розділи й теми форуму QuantRP, з яких програма бере правила сервера, закони штату й накази. Розділ береться з
          усіма підрозділами; вимкнена окремо тема всередині розділу пропускається. Оновлюється саме щодня о 03:00 за Києвом.
          Пошук у плашці: <Link to="/programa">програма Q-Hub</Link>.</p>
        <form className="form cols" onSubmit={add}>
          <label className="fld" style={{ flex: 3 }}><span>Посилання на розділ чи тему</span>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://forum.quant5.com.ua/index.php?/forum/…" spellCheck={false} /></label>
          <label className="fld"><span>Тип</span><Select value={kind} onChange={setKind} options={KINDS.map(([value, label]) => ({ value, label }))} /></label>
          <button className="btn" disabled={!!busy}>Додати</button>
        </form>
        {msg && <p className={msg.bad ? 'err' : 'good'} role="status">{msg.text}</p>}
      </section>
      <section className="card">
        {!list ? <div className="empty">Завантаження…</div> : !list.length ? <div className="empty">Джерел немає — пошук у програмі працює з вбудованої копії.</div> :
          <div className="scroll"><table className="t">
            <thead><tr><th>Джерело</th><th>Тип</th><th className="n">Пунктів</th><th>Оновлено</th><th>Остання зміна</th><th /></tr></thead>
            <tbody>{list.map(s => <tr key={s.id} className={s.enabled ? '' : 'muted'}>
              <td><a href={s.url} target="_blank" rel="noreferrer"><b>{s.title || short(s.url)}</b></a><br /><small className="mono muted">{short(s.url)}</small>
                {s.error && <><br /><small className="err">{s.error}</small></>}</td>
              <td>{KIND[s.kind]}</td>
              <td className="n">{s.items || '—'}</td>
              <td>{s.synced_at ? when(s.synced_at) : 'ще ні'}</td>
              <td>{diffText(s.diff)}</td>
              <td className="row" style={{ flexWrap: 'nowrap' }}>
                <button type="button" className="btn sm" onClick={() => toggle(s)}>{s.enabled ? 'Вимкнути' : 'Увімкнути'}</button>
                <button type="button" className="btn sm ghost" onClick={() => remove(s)} aria-label="Видалити джерело">✕</button></td>
            </tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
