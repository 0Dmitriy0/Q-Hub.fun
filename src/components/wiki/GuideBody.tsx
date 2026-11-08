import { Link } from 'react-router-dom';
import type { GuideBlock } from '../../data/guides';
import Icon from '../Icon';

/* текст гайду з блоків — і на сторінці гайду, і в перегляді під конструктором, і в «було → стало» у модератора */
export function Block({ b }: { b: GuideBlock }) {
  switch (b.k) {
    case 'p': return <p>{b.text}</p>;
    case 'h': return <h2 className="ev-sub">{b.text}</h2>;
    case 'list': return b.ordered ? <ol className="gd-list">{b.items.map((x, i) => <li key={i}>{x}</li>)}</ol>
      : <ul className="gd-list">{b.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case 'tip': return <div className="ev-tip"><Icon name="spark" size={18} /><p><b>Порада.</b> {b.text}</p></div>;
    case 'warn': return <div className="ev-tip gd-warn"><Icon name="alert" size={18} /><p><b>Увага.</b> {b.text}</p></div>;
    case 'table': return (
      <div className="gd-table"><table>
        <thead><tr>{b.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0
          ? <th key={j} scope="row">{c}</th>
          : <td key={j} data-label={b.head[j]}>{c || '—'}</td>)}</tr>)}</tbody>
      </table></div>);
    case 'links': return <div className="row gd-links">{b.items.map((l, i) => <Link key={i} className="btn sm ghost" to={l.to}><Icon name="chev" size={14} />{l.label}</Link>)}</div>;
    default: return null;
  }
}

export default function GuideBody({ blocks, className = '' }: { blocks: GuideBlock[]; className?: string }) {
  return <div className={'ev-text gd-text ' + className}>{blocks.map((b, i) => <Block key={i} b={b} />)}</div>;
}
