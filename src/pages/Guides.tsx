import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { useLinks } from '../lib/brand';
import { useAuth } from '../lib/auth';
import { guideData, useGuides, type GuideRow } from '../lib/guidesData';
import GuideBody from '../components/wiki/GuideBody';
import PageMeta from '../components/wiki/PageMeta';
import HistoryDialog from '../components/wiki/HistoryDialog';
import ProposeForm, { takeIntent, type ProposeTarget } from '../components/wiki/ProposeForm';
import type { Data } from '../lib/wiki';

/* WIKI → Гайди: список статей (/wiki/gaidy) і стаття (/wiki/gaidy/:slug). Гайди — з бази (wiki_guides, 0065), їх пишуть
   гравці: «Написати гайд», «Запропонувати правку», «Прибрати гайд» — через модерацію (ProposeForm → wiki_decide).
   Поки база не відповіла чи міграції ще немає — гайди з src/data/guides.ts і без кнопок. Стилі статті — як у івенту (ev-*) */
type Mode = 'edit' | 'new' | 'hide';
export default function Guides() {
  const { slug } = useParams();
  const { guides, fromDb, reload } = useGuides();
  const { session } = useAuth();
  const [prop, setProp] = useState<{ t: ProposeTarget; mode: Mode } | null>(null);
  const propose = (g: GuideRow | null, mode: Mode) => setProp({ mode, t: {
    section: 'guide', id: g?.slug ?? null, data: (g ? guideData(g) : { blocks: [{ k: 'p', text: '' }] }) as Data, version: g?.version, title: g?.title ?? 'новий гайд',
  } });
  /* після входу через Discord — та сама форма */
  useEffect(() => {
    if (!session || !fromDb) return;
    const it = takeIntent('guide'); if (!it) return;
    if (it.mode === 'new') propose(null, 'new'); else { const g = guides.find(x => x.slug === it.id); if (g) propose(g, it.mode); }
  }, [session, fromDb]);
  const on = fromDb ? propose : undefined;
  return (<>
    {slug ? <GuidePage slug={slug} guides={guides} propose={on} onChanged={reload} /> : <GuideList guides={guides} propose={on} />}
    <ProposeForm target={prop?.t ?? null} mode={prop?.mode ?? 'edit'} list={guides.map(g => ({ id: g.slug, name: g.title }))} onClose={() => setProp(null)} />
  </>);
}

type Propose = ((g: GuideRow | null, mode: Mode) => void) | undefined;

function GuideList({ guides, propose }: { guides: GuideRow[]; propose: Propose }) {
  return (
    <>
      <section className="wiki-hero">
        <div>
          <span className="h-pill"><span className="mdot" aria-hidden="true" />База знань штату QuantRP</span>
          <h1>Гайди</h1>
          <p className="muted">Те, чого немає в картках робіт і авто: перші кроки, банди, сім'ї та їхні квести, корисні хитрощі. Пишуть гравці — і ти можеш.</p>
        </div>
      </section>
      {propose && (
        <div className="card gd-write">
          <span className="ibub"><Icon name="edit" /></span>
          <div><b>Знаєш, як щось зробити краще?</b><p className="muted">Напиши гайд: модератор перевірить і опублікує його з твоїм ніком.</p></div>
          <button type="button" className="btn acc" onClick={() => propose(null, 'new')}><Icon name="plus" size={16} />Написати гайд</button>
        </div>
      )}
      <div className="gd-grid">{guides.map(g => (
        <Link key={g.slug} to={`/wiki/gaidy/${g.slug}`} className={'card gd-card' + (g.hidden ? ' gd-hidden' : '')}>
          <span className="ibub"><Icon name={g.icon} /></span>
          <div><b>{g.title}</b><p className="muted">{g.summary}</p>{g.hidden && <span className="wtag upd">Прибрано — гравці не бачать</span>}</div>
        </Link>
      ))}</div>
    </>
  );
}

function GuidePage({ slug, guides, propose, onChanged }: { slug: string; guides: GuideRow[]; propose: Propose; onChanged: () => void }) {
  const g = guides.find(x => x.slug === slug);
  const [links] = useLinks();
  const [hist, setHist] = useState(false);
  /* своя назва вкладки й опис статті — Google бере їх з відмальованої сторінки (Layout ставить лише «WIKI») */
  useEffect(() => {
    if (!g) return;
    document.title = `${g.title} — гайди · Q-Hub`;
    if (g.summary) document.querySelector('meta[name="description"]')?.setAttribute('content', g.summary);
  }, [g]);
  const back = <Link to="/wiki/gaidy" className="btn sm ghost ev-back"><Icon name="chev" size={16} />Усі гайди</Link>;
  if (!g) return (
    <div className="ev-page">{back}
      <div className="card empty wiki-none"><b>Такого гайду немає</b><span className="muted">Можливо, адресу змінили або гайд прибрали.</span><Link className="btn acc sm" to="/wiki/gaidy">Усі гайди</Link></div>
    </div>
  );
  const others = guides.filter(x => x.slug !== g.slug && !x.hidden);
  return (
    <article className="ev-page">
      {back}
      <header className="gd-head"><span className="ibub"><Icon name={g.icon} /></span><div><h1>{g.title}</h1><p className="muted">{g.summary}</p></div></header>
      <PageMeta createdLabel="Автор" createdBy={g.created_by} updatedBy={g.updated_by} createdAt={g.created_at} updatedAt={g.updated_at} version={g.version} hidden={g.hidden}
        onHistory={g.version !== undefined ? () => setHist(true) : undefined} />
      <GuideBody blocks={g.blocks} className="card" />
      {propose && (
        <div className="row gd-act">
          <button type="button" className="btn ghost sm" onClick={() => propose(g, 'edit')}><Icon name="edit" size={15} />Запропонувати правку</button>
          <button type="button" className="btn ghost sm" onClick={() => propose(g, 'hide')} title="Наприклад, гайд застарів після оновлення гри">Прибрати гайд</button>
        </div>
      )}
      <p className="muted gd-note">
        Дані з гри можуть застаріти після оновлень сервера. {propose ? 'Помітив неточність — запропонуй правку кнопкою вище або напиши нам' : 'Помітив неточність — напиши нам'}
        {links.discord_url ? <> у <a href={links.discord_url} target="_blank" rel="noopener noreferrer">Discord Q-Hub</a></> : ' у Discord Q-Hub'}.
        {links.market_url && <> Ціни гравців — на <a href={links.market_url} target="_blank" rel="noopener noreferrer">торговому майданчику</a>.</>}
      </p>
      {others.length > 0 && <nav className="gd-more" aria-label="Інші гайди"><h2 className="ev-sub">Інші гайди</h2>
        <div className="gd-grid">{others.map(x => (
          <Link key={x.slug} to={`/wiki/gaidy/${x.slug}`} className="card gd-card sm"><span className="ibub"><Icon name={x.icon} /></span><b>{x.title}</b></Link>
        ))}</div>
      </nav>}
      {g.version !== undefined && <HistoryDialog section="guide" target={g.slug} title={g.title} hidden={g.hidden} open={hist} onClose={() => setHist(false)} onChanged={onChanged} />}
    </article>
  );
}
