import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { splitPenalty } from './barParts';
import { abbrsOf, KIND, numLabel, type RuleKind } from './rulesSearch';

/* окреме вікно з правилом (specs/084, contracts/rule-window.md): заголовок «Правило» — ручка перетягування, вкладки, пункт.
   Стан дає головний процес; locked — Alt+Q закрита: вікно зафіксоване, кнопок немає, кліки йдуть у гру */
interface Tab { id: string; topic: string; url: string; kind: RuleKind; n: string; h: string; s: string }
interface State { tabs: Tab[]; active: string | null; note: string | null; locked: boolean }
interface RuleApi {
  ruleState(): Promise<State | null>; onRuleState(cb: (s: State) => void): () => void;
  ruleTab(id: string): Promise<void>; ruleCloseTab(id: string): Promise<void>; ruleClose(): Promise<void>;
}
const api = (window as unknown as { qhub: RuleApi }).qhub;

/* підпис вкладки: «КК ст. 6.7» — скорочення документа й номер; без скорочення — початок назви */
const tabLabel = (t: Tab) => [abbrsOf(t.topic)[0]?.toUpperCase() || t.topic.slice(0, 14), numLabel(t.kind, t.n)].filter(Boolean).join(' ');

export default function RuleWin() {
  const [st, setSt] = useState<State>({ tabs: [], active: null, note: null, locked: true });
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const take = (s: State | null) => { if (!s) return; setSt(s); if (s.note) setNote(s.note); };
    api.ruleState().then(take).catch(() => {});
    return api.onRuleState(take);
  }, []);
  /* «найстаріше закрито» — на 4 с */
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 4000); return () => clearTimeout(t); }, [note]);

  const cur = st.tabs.find(t => t.id === st.active) || st.tabs[st.tabs.length - 1];
  const { body, pen, more } = cur ? splitPenalty(cur.s) : { body: '', pen: '', more: '' };
  return <div className={'rwin' + (st.locked ? ' locked' : ' free')}>
    <div className="rwin-head" title={st.locked ? 'Зафіксовано — відкрий Alt+Q, щоб рухати чи змінити розмір' : 'Тягни за заголовок · край чи кут — розмір'}>
      <b>Правило</b>
      <div className="rwin-tabs" role="tablist">
        {st.tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={t.id === cur?.id} className={'rwin-tab' + (t.id === cur?.id ? ' on' : '')}
          title={`${KIND[t.kind]} · ${t.topic}${t.n ? ' · ' + numLabel(t.kind, t.n) : ''}`} onClick={() => { if (!st.locked) api.ruleTab(t.id).catch(() => {}); }}>
          <span>{tabLabel(t)}</span>
          {!st.locked && <i role="button" aria-label="Закрити вкладку" onClick={e => { e.stopPropagation(); api.ruleCloseTab(t.id).catch(() => {}); }}><Icon name="x" size={11} /></i>}
        </button>)}
      </div>
      {st.locked ? <span className="rwin-lock">Alt+Q — рухати</span>
        : <button type="button" className="rwin-x" aria-label="Закрити вікно" title="Закрити вікно" onClick={() => api.ruleClose().catch(() => {})}><Icon name="x" size={15} /></button>}
    </div>
    {note && <div className="rwin-note" role="status">{note}</div>}
    {cur && <div className="rwin-body">
      <div className="brule-top">
        <span className={'bkindtag ' + cur.kind}>{KIND[cur.kind]}</span>
        {cur.n && <span className="bpunkt">{numLabel(cur.kind, cur.n)}</span>}
        {cur.url ? <a href={cur.url} target="_blank" rel="noreferrer" title="Відкрити тему на форумі">{cur.topic}</a> : <a>{cur.topic}</a>}
      </div>
      <p>{body}</p>
      {pen && <span className="bpen">{pen}</span>}
      {more && <p className="bextra">{more}</p>}
    </div>}
  </div>;
}
