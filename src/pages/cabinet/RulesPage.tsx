import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { KIND, numLabel, type RuleKind } from '../../desktop/rulesSearch';

/* Вкладка «Правила» в програмі: лише те, що змінилось у правилах сервера й законах штату — нові, змінені й прибрані пункти.
   Журнал складає сервер (supabase/functions/rules-sync/changes.ts) щоночі, коли тягне правила з форуму, і кладе в публічний
   бакет rules (rules-changes.json) — тож і новий гравець бачить зміни за останні місяці з датами.
   «Нове» — записи, новіші за ті, що гравець уже відкривав (пам'ятає ця програма, localStorage). */

type Doc = { doc: string; section: string; url: string; kind: RuleKind };
type Item = { n: string; h: string; s: string };
type ItemChange = Doc & Item & ({ type: 'added' } | { type: 'removed' } | { type: 'changed'; old: string });
type DocChange = Doc & ({ type: 'doc-added'; items: number } | { type: 'doc-removed'; items: number } | { type: 'doc-rewritten'; added: number; changed: number; removed: number });
export type Change = ItemChange | DocChange;
const isDoc = (c: Change): c is DocChange => c.type.startsWith('doc-');
/* more — скільки змін того дня не влізло в журнал (сервер обмежує розмір файлу) */
interface Entry { at: string; changes: Change[]; more?: number }
interface Log { updated: string; entries: Entry[] }

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const SEEN = 'qhub-rules-seen';
/* один запит на відкриття програми: плитка (скільки нового) і сторінка беруть те саме */
let loading: Promise<Log | null> | null = null;
export function loadRulesLog(fresh = false): Promise<Log | null> {
  if (!URL_) return Promise.resolve(null);
  if (!loading || fresh) loading = fetch(URL_ + '/storage/v1/object/public/rules/rules-changes.json', { cache: 'no-cache' })
    /* 400/404 — журналу ще немає (rules-sync ще не знайшла жодної зміни): це порожньо, а не помилка */
    .then(r => (r.ok ? r.json() : r.status === 400 || r.status === 404 ? { updated: '', entries: [] } : Promise.reject(new Error(String(r.status)))))
    .then((l: Log) => (Array.isArray(l?.entries) ? l : { updated: '', entries: [] }))
    .catch(e => { loading = null; throw e; });
  return loading;
}
const seenAt = () => { try { return localStorage.getItem(SEEN) || ''; } catch { return ''; } };
/* скільки змін гравець ще не бачив (для плитки); перше відкриття програми — без значка, щоб не кричати про весь журнал */
export function unseenRules(l: Log | null) {
  const s = seenAt();
  if (!l || !s) return 0;
  return l.entries.filter(e => e.at > s).reduce((n, e) => n + e.changes.length, 0);
}

type Filter = 'all' | 'added' | 'changed' | 'removed';
const FILTERS: [Filter, string][] = [['all', 'Усе'], ['added', 'Нові'], ['changed', 'Змінені'], ['removed', 'Прибрані']];
const group = (c: Change): Exclude<Filter, 'all'> =>
  c.type === 'added' || c.type === 'doc-added' ? 'added' : c.type === 'removed' || c.type === 'doc-removed' ? 'removed' : 'changed';
const BADGE: Record<Exclude<Filter, 'all'>, [string, string]> = { added: ['Новий', 'good'], changed: ['Змінено', 'warn'], removed: ['Прибрано', 'bad'] };
const day = (ts: string) => new Date(ts).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
const plural = (n: number, a: string, b: string, c: string) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c}`;

export default function RulesPage() {
  const [log, setLog] = useState<Log | null>(null);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  /* що було «новим» на момент відкриття — підсвітка лишається, поки сторінка відкрита */
  const [seen] = useState(seenAt);
  useEffect(() => {
    loadRulesLog(true).then(l => {
      setLog(l);
      if (l?.entries[0]) try { localStorage.setItem(SEEN, l.entries[0].at); } catch { /* без пам'яті — просто без «нове» */ }
    }).catch(() => setErr(true));
  }, []);

  const entries = useMemo(() => (log?.entries ?? [])
    .map(e => ({ ...e, changes: e.changes.filter(c => filter === 'all' || group(c) === filter) }))
    .filter(e => e.changes.length), [log, filter]);

  if (err) return <div className="card empty">Не вдалося завантажити зміни правил. Перевір інтернет і відкрий вкладку ще раз.</div>;
  if (!log) return <div className="card empty">Завантаження…</div>;
  if (!log.entries.length) return <div className="card empty">Поки змін немає. Щойно на форумі додадуть, змінять чи приберуть правило — воно з'явиться тут.</div>;

  return (
    <div className="rch">
      <div className="seg" role="group" aria-label="Які зміни показати">
        {FILTERS.map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {entries.length ? entries.map(e => <Day key={e.at} e={e} fresh={!!seen && e.at > seen} />)
        : <div className="card empty">Таких змін за останні місяці немає.</div>}
      <p className="muted note">Зміни перевіряються щоночі з форуму сервера. Тут — останні 4 місяці.</p>
    </div>
  );
}

/* одне оновлення: зміни, згруповані за документом */
function Day({ e, fresh }: { e: Entry; fresh: boolean }) {
  const docs = useMemo(() => {
    const m = new Map<string, Change[]>();
    for (const c of e.changes) m.set(c.url, [...(m.get(c.url) ?? []), c]);
    return [...m.values()];
  }, [e]);
  return (
    <section className="rch-day">
      <h2 className="dsect">{day(e.at)}{fresh && <span className="pill acc">нове</span>}</h2>
      {docs.map(cs => (
        <article key={cs[0].url} className="card rch-doc">
          <header>
            <span><b>{cs[0].doc}</b><small>{KIND[cs[0].kind] ?? KIND.rules}{cs[0].section && cs[0].section !== cs[0].doc ? ` · ${cs[0].section}` : ''}</small></span>
            <a className="btn ghost sm" href={cs[0].url} target="_blank" rel="noreferrer"><Icon name="ext" size={14} />На форумі</a>
          </header>
          <ul>{cs.map((c, i) => <Row key={i} c={c} />)}</ul>
        </article>))}
      {!!e.more && <p className="muted note">Того дня змін було більше — ще {e.more} не вмістилося сюди. Повний текст документів — на форумі.</p>}
    </section>
  );
}

function Row({ c }: { c: Change }) {
  const [label, tone] = BADGE[group(c)];
  if (isDoc(c)) {
    const text = c.type === 'doc-added' ? `Новий документ · ${plural(c.items, 'пункт', 'пункти', 'пунктів')}`
      : c.type === 'doc-removed' ? 'Документ прибрано з форуму'
        : `Документ суттєво оновлено: ${[c.added && `+${c.added} нових`, c.changed && `${c.changed} змінено`, c.removed && `−${c.removed} прибрано`].filter(Boolean).join(', ')}`;
    return <li><span className={'pill ' + tone}>{c.type === 'doc-rewritten' ? 'Оновлено' : label}</span><p>{text}</p></li>;
  }
  const num = numLabel(c.kind ?? 'rules', c.n);
  return (
    <li>
      <span className={'pill ' + tone}>{label}</span>
      <div>
        {(num || c.h) && <small className="muted">{[num, c.h].filter(Boolean).join(' · ')}</small>}
        <p className={c.type === 'removed' ? 'gone' : ''}>{c.s}</p>
        {c.type === 'changed' && <details><summary>Як було</summary><p className="gone">{c.old}</p></details>}
      </div>
    </li>
  );
}
