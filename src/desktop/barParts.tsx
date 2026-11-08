import { useState } from 'react';
import Icon from '../components/Icon';
import { asset } from '../lib/app';
import { money, when } from '../lib/format';
import { pos, type BuyerHit, type PlaceHit } from './barSearch';
import { KIND, numLabel, type RuleHit } from './rulesSearch';

/* частини плашки Alt+Q, спільні для програми (Bar.tsx) і демо на сайті (components/BarDemo.tsx) —
   щоб на сторінці «Програма» було видно рівно те, що в грі */

/* «Копіювати»: пункт правил, відповідь ШІ чи ціни скупника — у буфер, щоб вставити в гру, Discord чи документ */
/* icon — лише значок (на кожному пункті й відповіді ШІ): назва — у підказці, стан — значком ✓ і для читача екрана */
export function CopyBtn({ text, label = 'Копіювати', short = 'Копіювати', icon }: { text: string; label?: string; short?: string; icon?: boolean }) {
  const [st, setSt] = useState<'' | 'ok' | 'fail'>('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setSt('ok'); } catch { setSt('fail'); }
    setTimeout(() => setSt(''), 1600);
  };
  const msg = st === 'ok' ? 'Скопійовано' : st === 'fail' ? 'Не вийшло — виділи текст і Ctrl+C' : short;
  return <button type="button" className={'bcopy' + (icon ? ' only' : '') + (st ? ' ' + st : '')} onClick={copy}
    title={icon && st ? msg : label} aria-label={label}>
    <Icon name={st === 'ok' ? 'check' : 'copy'} size={icon ? 15 : 14} /><span className={icon ? 'vh' : undefined} aria-live="polite">{icon && !st ? '' : msg}</span>
  </button>;
}

/* «Заборонено … | Деморган 60 хв. Примітка: …» — покарання окремо, щоб його було видно одразу; примітки й винятки — після нього */
export function splitPenalty(t: string) {
  const i = t.search(/\s\|\s/);
  if (i < 0) return { body: t, pen: '', more: '' };
  const tail = t.slice(i).replace(/^\s*\|\s*/, '').replace(/\s*\|\s*/g, ' · ').trim();
  const j = tail.search(/\s(Примітк|Виняток|Винятки|Уточнення|Приклад)/);
  return { body: t.slice(0, i).trim(), pen: j < 0 ? tail : tail.slice(0, j).trim(), more: j < 0 ? '' : tail.slice(j).trim() };
}

/* текст для буфера: «Кримінальний кодекс, ст. 6.5» + текст + покарання — щоб у вставленому було видно, звідки пункт */
export function ruleText(h: RuleHit) {
  const { body, pen, more } = splitPenalty(h.s);
  return [h.topic + (h.n ? ', ' + numLabel(h.kind, h.n) : ''), body, pen, more].filter(Boolean).join('\n');
}
/* «Копіювати все»: усі знайдені пункти через порожній рядок */
export const rulesText = (hits: RuleHit[]) => hits.map(ruleText).join('\n\n');
/* місця з мапи: «Заправка №3 — Заправки, X 120 · Y -340» */
export const placesText = (pl: PlaceHit[]) => pl.map(p => `${p.name} — ${p.cat}, X ${Math.round(p.x)} · Y ${Math.round(p.y)}`).join('\n');

export function RuleCard({ h }: { h: RuleHit }) {
  const [open, setOpen] = useState(false);
  const { body, pen, more } = splitPenalty(h.s);
  const long = body.length > 260 || body.split('\n').length > 4;
  /* «Кримінальний кодекс, ст. 6.5» + текст + покарання — щоб у вставленому було видно, звідки пункт */
  const text = ruleText(h);
  return <li className="brule">
    <div className="brule-top">
      {/* правила сервера карає адміністрація, закони штату — гра: гравцю важливо бачити, що саме порушує (specs/010 FR-005) */}
      <span className={'bkindtag ' + h.kind}>{KIND[h.kind]}</span>
      {h.n && <span className="bpunkt">{numLabel(h.kind, h.n)}</span>}
      <a href={h.url} target="_blank" rel="noreferrer" title="Відкрити тему на форумі">{h.topic}</a>
      <CopyBtn icon text={text} label="Копіювати пункт" />
    </div>
    <p className={long && !open ? 'clamp' : ''}>{body}</p>
    {long && <button className="bmore" onClick={() => setOpen(o => !o)}>{open ? 'Згорнути' : 'Показати повністю'}</button>}
    {pen && <span className="bpen">{pen}</span>}
    {more && <p className="bextra">{more}</p>}
  </li>;
}

/* посилання на пункти у відповіді ШІ — «(Правила Зелених Зон, п. 1.3)», «(Кримінальний кодекс, ст. 6.5)» — помітні, щоб було видно, звідки відповідь */
export const cites = (t: string) => t.split(/(\([^()]*(?:п|ст)\.\s*\d[^()]*\))/g).map((p, i) => (i % 2 ? <mark key={i} className="bcite">{p.slice(1, -1)}</mark> : p));

/* ціни: ліворуч скупники, що підійшли під запит, праворуч товари відкритого скупника з цінами */
export function Prices({ hits, setSel, cur, q }: { hits: BuyerHit[]; setSel: (n: number) => void; cur: BuyerHit | null; q: string }) {
  if (!cur) return <div className="bempty">{q.trim() ? `Скупника «${q.trim()}» не знайшов. Спробуй «шкури», «риба», «гриби».` : 'Назви скупника чи товар — побачиш його ціни.'}</div>;
  const left = hits.length ? hits : [cur];
  return <>
    <div className="bleft">{left.map((b, i) => (
      <button key={b.buyer} className={'brow item' + (b.buyer === cur.buyer ? ' on' : '')} onClick={() => hits.length && setSel(i)}>
        {b.icon ? <img src={asset(b.icon)} alt="" /> : <span className="bava" />}
        <span><b>{b.buyer}</b><small>{b.items.length} товар{b.items.length % 10 === 1 && b.items.length % 100 !== 11 ? '' : 'ів'}</small></span>
      </button>))}</div>
    <div className="bright">
      <div className="bhead">{cur.icon ? <img src={asset(cur.icon)} alt="" /> : null}<div><h3>{cur.buyer}</h3><small className="muted">Ціни, які внесли гравці; у грі вони могли змінитися</small></div>
        <CopyBtn label="Копіювати ціни скупника" text={[cur.buyer + ':', ...cur.items.filter(x => x.price).map(x => `${x.item} — ${money(x.price)}/${x.unit}`)].join('\n')} /></div>
      <div className="bbuyers">{cur.items.map(x => { const p = pos(x); return (
        <div key={x.item} className="bbuy">
          {x.icon ? <img src={asset(x.icon)} alt="" /> : <span className="bava" />}
          <span><b>{x.item}</b><small>{x.max > x.min ? `межі ${money(x.min)}–${money(x.max)}` : 'межі не вписані'}{x.at ? ` · ${when(x.at)}` : ''}{x.pend ? <span className="warn" title="Цю ціну внесли не всі потрібні гравці: поточною вона стане, коли ту саму внесе ще хтось"> · нова {money(x.pend.price)} · {x.pend.votes} з {x.pend.need}</span> : null}</small></span>
          {p !== null && <span className="brange" title={`${p}% діапазону`}><i style={{ left: p + '%' }} /></span>}
          <b className="mono">{x.price ? `${money(x.price)}/${x.unit}` : '—'}</b>
        </div>); })}</div>
    </div>
  </>;
}
