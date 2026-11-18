import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { builtinGlossary, loadGlossary } from '../lib/glossary';
import { KIND, numLabel, searchRules, type GlossaryTerm, type RuleTopic } from '../desktop/rulesSearch';
import RULES from '../data/rules.json';

/* WIKI → «Глосарій» (specs/093 US4): RP-терміни за абеткою, фільтр; клік розгортає термін і показує пункти правил —
   той самий пошук, що в Alt+Q програми (вбудована копія правил сайту). Терміни — з бази (кеш 10 хв), без бази — вбудовані */
const TOPICS = (RULES as { topics: RuleTopic[] }).topics;
const key = (g: GlossaryTerm) => `${g.term}|${g.full_name}`;

export default function Glossary() {
  const [terms, setTerms] = useState<GlossaryTerm[]>(() => builtinGlossary());
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { loadGlossary().then(setTerms).catch(() => { /* лишається вбудований */ }); }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return terms.filter(g => !s || [g.term, g.full_name, g.description, ...g.aliases].some(x => x.toLowerCase().includes(s)))
      .sort((a, b) => a.term.localeCompare(b.term, 'uk') || a.full_name.localeCompare(b.full_name, 'uk'));
  }, [terms, q]);

  return (
    <section className="gloss" aria-labelledby="gloss-h">
      <header className="gloss-head">
        <h1 id="gloss-h">Глосарій RP-термінів</h1>
        <p className="muted">Скорочення, які трапляються в правилах і чаті QuantRP. Натисни на термін — побачиш пункти правил про нього. У програмі Q-Hub ці терміни розуміє пошук у Alt+Q.</p>
        <label className="gloss-search">
          <span className="sr">Фільтр термінів</span>
          <Icon name="search" size={16} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ДМ, вбивство, зелена зона…" />
        </label>
      </header>
      {!list.length && <p className="adm-empty">Такого терміну немає.</p>}
      <ul className="gloss-list">
        {list.map(g => {
          const k = key(g), isOpen = open === k;
          const names = [...g.aliases, g.full_name].filter((n, i, a) => n && a.findIndex(x => x.toLowerCase() === n.toLowerCase()) === i);
          return (
            <li key={k} className={'gloss-item' + (isOpen ? ' on' : '')}>
              <button type="button" className="gloss-row" aria-expanded={isOpen} aria-controls={'gl-' + k} onClick={() => setOpen(isOpen ? null : k)}>
                <b className="gloss-term">{g.term}</b>
                <span className="gloss-main">
                  {names.length > 0 && <span className="gloss-names">{names.join(', ')}</span>}
                  <span>{g.description}</span>
                </span>
                <Icon name="chev" size={18} />
              </button>
              {isOpen && <Related id={'gl-' + k} term={g} all={terms} />}
            </li>);
        })}
      </ul>
    </section>
  );
}

/* пункти правил для терміну; спільне скорочення (ГМ, ТК) шукаємо за повною назвою, щоб не змішати значення */
function Related({ id, term, all }: { id: string; term: GlossaryTerm; all: GlossaryTerm[] }) {
  const shared = all.filter(x => x.term.toLowerCase() === term.term.toLowerCase()).length > 1;
  const hits = searchRules(TOPICS, shared && term.full_name ? term.full_name : term.term, 8, all);
  return (
    <div id={id} className="gloss-rules">
      {!hits.length ? <p className="muted">Окремого пункту в правилах немає.</p> : (
        <ol>
          {hits.map((h, i) => (
            <li key={i}>
              <small className="muted">{KIND[h.kind]} · {h.topic}{h.n ? `, ${numLabel(h.kind, h.n)}` : ''}</small>
              <p>{h.s.split('|')[0].trim()}</p>
            </li>))}
        </ol>)}
    </div>
  );
}
