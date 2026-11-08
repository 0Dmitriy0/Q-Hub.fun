import type { GuideBlock } from '../../data/guides';
import { emptyBlock, KIND_NAME, LIMITS, type BlockKind } from '../../lib/guideBlocks';
import Icon from '../Icon';

/* Конструктор тексту гайду: блоки один під одним — абзац, підзаголовок, список, порада, увага, таблиця, посилання.
   Блок можна підняти, опустити й прибрати. Порожні пункти списку й посилань прибираються при надсиланні (tidyBlocks) —
   тож тут їх лишаємо, щоб Enter у списку не «з'їдав» новий рядок */
const ADD: BlockKind[] = ['p', 'h', 'list', 'tip', 'warn', 'table', 'links'];
const PLACE: Partial<Record<BlockKind, string>> = {
  p: 'Звичайний текст', h: 'Наприклад: «З чого почати»', tip: 'Корисна порада — покажеться з позначкою «Порада»',
  warn: 'Застереження — покажеться жовтим з позначкою «Увага»',
};

export default function BlockEditor({ value, onChange, idPrefix = 'be' }: { value: GuideBlock[]; onChange: (b: GuideBlock[]) => void; idPrefix?: string }) {
  const set = (i: number, b: GuideBlock) => onChange(value.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => { const a = [...value]; [a[i], a[i + d]] = [a[i + d], a[i]]; onChange(a); };
  const drop = (i: number) => onChange(value.filter((_, j) => j !== i));
  const full = value.length >= LIMITS.blocks;

  return (
    <div className="bed">
      {!value.length && <p className="muted bed-empty">Гайд ще порожній — додай перший блок кнопками нижче.</p>}
      <ol className="bed-list">
        {value.map((b, i) => {
          const id = `${idPrefix}-${i}`;
          return (
            <li key={i} className={'bed-b k-' + b.k}>
              <div className="bed-h">
                <b id={id + '-t'}>{KIND_NAME[b.k]}</b>
                <span className="bed-tools">
                  <button type="button" className="hud-b" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Підняти блок ${i + 1}`} title="Підняти"><Icon name="chev" className="up" size={15} /></button>
                  <button type="button" className="hud-b" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label={`Опустити блок ${i + 1}`} title="Опустити"><Icon name="chev" size={15} /></button>
                  <button type="button" className="hud-b" onClick={() => drop(i)} aria-label={`Прибрати блок ${i + 1}: ${KIND_NAME[b.k]}`} title="Прибрати блок"><Icon name="x" size={15} /></button>
                </span>
              </div>
              <Body b={b} id={id} onChange={nb => set(i, nb)} />
            </li>
          );
        })}
      </ol>
      <div className="bed-add" role="group" aria-label="Додати блок">
        {ADD.map(k => <button key={k} type="button" className="btn ghost sm" disabled={full} onClick={() => onChange([...value, emptyBlock(k)])}><Icon name="plus" size={14} />{KIND_NAME[k]}</button>)}
        {full && <small className="muted">Гайд — до {LIMITS.blocks} блоків.</small>}
      </div>
    </div>
  );
}

function Body({ b, id, onChange }: { b: GuideBlock; id: string; onChange: (b: GuideBlock) => void }) {
  const label = id + '-t';
  switch (b.k) {
    case 'h':
      return <input aria-labelledby={label} value={b.text} maxLength={LIMITS.heading} placeholder={PLACE.h} onChange={e => onChange({ ...b, text: e.target.value })} />;
    case 'p': case 'tip': case 'warn':
      return <textarea aria-labelledby={label} rows={b.k === 'p' ? 4 : 2} value={b.text} maxLength={LIMITS.text} placeholder={PLACE[b.k]} onChange={e => onChange({ ...b, text: e.target.value })} />;
    case 'list':
      return (<>
        <textarea aria-labelledby={label} aria-describedby={id + '-h'} rows={Math.min(10, Math.max(3, b.items.length + 1))} value={b.items.join('\n')}
          onChange={e => onChange({ ...b, items: e.target.value.split('\n') })} />
        <span className="bed-row">
          <small id={id + '-h'} className="muted">Кожен пункт — окремий рядок.</small>
          <label className="mcheck"><input type="checkbox" checked={!!b.ordered} onChange={e => onChange(e.target.checked ? { ...b, ordered: true } : { k: 'list', items: b.items })} />Нумерований (кроки по порядку)</label>
        </span>
      </>);
    case 'table': {
      const n = b.head.length;
      const setCell = (r: number, c: number, v: string) => onChange({ ...b, rows: b.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
      return (<>
        <div className="bed-tbl" role="group" aria-labelledby={label}>
          <table>
            <thead><tr>{b.head.map((h, c) => <th key={c}><input aria-label={`Назва стовпця ${c + 1}`} value={h} maxLength={60} placeholder={c === 0 ? 'Що' : 'Стовпець'}
              onChange={e => onChange({ ...b, head: b.head.map((x, j) => (j === c ? e.target.value : x)) })} /></th>)}<th aria-hidden="true" /></tr></thead>
            <tbody>{b.rows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => <td key={c}><input aria-label={`Рядок ${r + 1}, ${b.head[c] || 'стовпець ' + (c + 1)}`} value={cell} maxLength={LIMITS.cell} onChange={e => setCell(r, c, e.target.value)} /></td>)}
                <td><button type="button" className="hud-b" disabled={b.rows.length === 1} onClick={() => onChange({ ...b, rows: b.rows.filter((_, i) => i !== r) })} aria-label={`Прибрати рядок ${r + 1}`} title="Прибрати рядок"><Icon name="x" size={14} /></button></td>
              </tr>))}
            </tbody>
          </table>
        </div>
        <span className="bed-row">
          <button type="button" className="btn ghost sm" disabled={b.rows.length >= LIMITS.rows} onClick={() => onChange({ ...b, rows: [...b.rows, Array(n).fill('')] })}><Icon name="plus" size={14} />Рядок</button>
          <button type="button" className="btn ghost sm" disabled={n >= LIMITS.cols[1]} onClick={() => onChange({ ...b, head: [...b.head, ''], rows: b.rows.map(r => [...r, '']) })}><Icon name="plus" size={14} />Стовпець</button>
          <button type="button" className="btn ghost sm" disabled={n <= LIMITS.cols[0]} onClick={() => onChange({ ...b, head: b.head.slice(0, -1), rows: b.rows.map(r => r.slice(0, -1)) })}><Icon name="minus" size={14} />Останній стовпець</button>
        </span>
      </>);
    }
    case 'links':
      return (<>
        <div className="bed-links" role="group" aria-labelledby={label}>
          {b.items.map((l, i) => (
            <span key={i} className="bed-link">
              <input aria-label={`Посилання ${i + 1}: назва`} placeholder="Назва, напр. «Рибак»" value={l.label} maxLength={LIMITS.label}
                onChange={e => onChange({ ...b, items: b.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <input aria-label={`Посилання ${i + 1}: сторінка сайту`} className="mono" placeholder="/wiki/roboty?job=fisher" value={l.to} maxLength={200} spellCheck={false}
                onChange={e => onChange({ ...b, items: b.items.map((x, j) => (j === i ? { ...x, to: e.target.value.trim() } : x)) })} />
              <button type="button" className="hud-b" disabled={b.items.length === 1} onClick={() => onChange({ ...b, items: b.items.filter((_, j) => j !== i) })} aria-label={`Прибрати посилання ${i + 1}`} title="Прибрати"><Icon name="x" size={14} /></button>
            </span>))}
        </div>
        <span className="bed-row">
          <small className="muted">Лише сторінки Q-Hub: скопіюй адресу після q-hub.fun, напр. /wiki/roboty?job=fisher чи /mapa.</small>
          <button type="button" className="btn ghost sm" disabled={b.items.length >= LIMITS.links} onClick={() => onChange({ ...b, items: [...b.items, { to: '/wiki/', label: '' }] })}><Icon name="plus" size={14} />Посилання</button>
        </span>
      </>);
    default:
      return null;
  }
}
