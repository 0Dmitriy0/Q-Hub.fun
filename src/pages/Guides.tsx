import { Link, useParams } from 'react-router-dom';
import { GUIDES, guideBySlug, type GuideBlock } from '../data/guides';
import Icon from '../components/Icon';
import { useLinks } from '../lib/brand';

/* WIKI → Гайди: список статей (/wiki/gaidy) і стаття (/wiki/gaidy/:slug). Тексти — src/data/guides.ts; стилі статті — як у івенту (ev-*) */
export default function Guides() {
  const { slug } = useParams();
  return slug ? <GuidePage slug={slug} /> : <GuideList />;
}

function GuideList() {
  return (
    <>
      <section className="wiki-hero">
        <div>
          <span className="h-pill"><span className="mdot" aria-hidden="true" />База знань штату QuantRP</span>
          <h1>Гайди</h1>
          <p className="muted">Те, чого немає в картках робіт і авто: перші кроки, банди, сім'ї та їхні квести, корисні хитрощі.</p>
        </div>
      </section>
      <div className="gd-grid">{GUIDES.map(g => (
        <Link key={g.slug} to={`/wiki/gaidy/${g.slug}`} className="card gd-card">
          <span className="ibub"><Icon name={g.icon} /></span>
          <div><b>{g.title}</b><p className="muted">{g.summary}</p></div>
        </Link>
      ))}</div>
    </>
  );
}

function Block({ b }: { b: GuideBlock }) {
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
    case 'links': return <div className="row gd-links">{b.items.map(l => <Link key={l.to} className="btn sm ghost" to={l.to}><Icon name="chev" size={14} />{l.label}</Link>)}</div>;
  }
}

function GuidePage({ slug }: { slug: string }) {
  const g = guideBySlug(slug);
  const [links] = useLinks();
  const back = <Link to="/wiki/gaidy" className="btn sm ghost ev-back"><Icon name="chev" size={16} />Усі гайди</Link>;
  if (!g) return (
    <div className="ev-page">{back}
      <div className="card empty wiki-none"><b>Такого гайду немає</b><span className="muted">Можливо, адресу змінили.</span><Link className="btn acc sm" to="/wiki/gaidy">Усі гайди</Link></div>
    </div>
  );
  const others = GUIDES.filter(x => x.slug !== g.slug);
  return (
    <article className="ev-page">
      {back}
      <header className="gd-head"><span className="ibub"><Icon name={g.icon} /></span><div><h1>{g.title}</h1><p className="muted">{g.summary}</p></div></header>
      <section className="card ev-text gd-text">{g.blocks.map((b, i) => <Block key={i} b={b} />)}</section>
      <p className="muted gd-note">
        Дані з гри можуть застаріти після оновлень сервера. Помітив неточність — напиши нам
        {links.discord_url ? <> у <a href={links.discord_url} target="_blank" rel="noopener noreferrer">Discord Q-Hub</a></> : ' у Discord Q-Hub'}.
        {links.market_url && <> Ціни гравців — на <a href={links.market_url} target="_blank" rel="noopener noreferrer">торговому майданчику</a>.</>}
      </p>
      <nav className="gd-more" aria-label="Інші гайди"><h2 className="ev-sub">Інші гайди</h2>
        <div className="gd-grid">{others.map(x => (
          <Link key={x.slug} to={`/wiki/gaidy/${x.slug}`} className="card gd-card sm"><span className="ibub"><Icon name={x.icon} /></span><b>{x.title}</b></Link>
        ))}</div>
      </nav>
    </article>
  );
}
