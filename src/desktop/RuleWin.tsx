import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { splitPenalty } from './barParts';
import { abbrsOf, KIND, numLabel, type RuleKind } from './rulesSearch';

/* окреме вікно з правилом (specs/084, contracts/rule-window.md): заголовок «Правило» — ручка перетягування, вкладки, пункт.
   Стан дає головний процес; locked — Alt+Q закрита: вікно зафіксоване, кнопок немає, кліки йдуть у гру.
   all — «усі разом»: до 5 пунктів одне під одним замість вкладок; keep — око: лишати поверх гри, коли Alt+Q закрита */
interface Tab { id: string; topic: string; url: string; kind: RuleKind; n: string; h: string; s: string }
interface State { tabs: Tab[]; active: string | null; note: string | null; locked: boolean; opacity?: number; keep?: boolean; all?: boolean }
interface RuleApi {
  ruleState(): Promise<State | null>; onRuleState(cb: (s: State) => void): () => void;
  ruleTab(id: string): Promise<void>; ruleCloseTab(id: string): Promise<void>; ruleClose(): Promise<void>; ruleSize(h: number): Promise<void>;
  ruleOpts(p: { keep?: boolean; all?: boolean }): Promise<void>;
}
const api = (window as unknown as { qhub: RuleApi }).qhub;

/* підпис вкладки: «КК ст. 6.7» — скорочення документа й номер; без скорочення — початок назви */
const tabLabel = (t: Tab) => [abbrsOf(t.topic)[0]?.toUpperCase() || t.topic.slice(0, 14), numLabel(t.kind, t.n)].filter(Boolean).join(' ');

/* один пункт: вид, номер, документ, текст, покарання — як у відповіді Alt+Q; onClose — хрестик у режимі «усі разом» */
function Rule({ t, onClose }: { t: Tab; onClose?: () => void }) {
  const { body, pen, more } = splitPenalty(t.s);
  return <div className="rwin-rule">
    <div className="brule-top">
      <span className={'bkindtag ' + t.kind}>{KIND[t.kind]}</span>
      {t.n && <span className="bpunkt">{numLabel(t.kind, t.n)}</span>}
      {t.url ? <a href={t.url} target="_blank" rel="noreferrer" title="Відкрити тему на форумі">{t.topic}</a> : <a>{t.topic}</a>}
      {onClose && <button type="button" className="rwin-x sm" aria-label="Закрити пункт" title="Закрити пункт" onClick={onClose}><Icon name="x" size={12} /></button>}
    </div>
    <p>{body}</p>
    {pen && <span className="bpen">{pen}</span>}
    {more && <p className="bextra">{more}</p>}
  </div>;
}

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

  /* висота вікна — під вміст: .rwrap висотою з вміст (обрізаний вікном) + те, що сховано під прокруткою;
     головний процес обріже до половини екрана (усі разом — до 85 %) */
  const wrap = useRef<HTMLDivElement>(null), win = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const send = () => {
      const w = wrap.current, b = inner.current?.parentElement;
      if (!w) return;
      api.ruleSize(Math.ceil(w.offsetHeight + (b ? b.scrollHeight - b.clientHeight : 0))).catch(() => {});
    };
    const ro = new ResizeObserver(send);
    [win.current, inner.current].forEach(el => el && ro.observe(el));
    send();
    return () => ro.disconnect();
  }, [st.active, st.tabs.length, st.all, note]);

  const free = !st.locked, all = !!st.all && st.tabs.length > 1, keep = st.keep !== false;
  const cur = st.tabs.find(t => t.id === st.active) || st.tabs[st.tabs.length - 1];
  return <div className="rwrap" ref={wrap}><div ref={win} className={'rwin' + (free ? ' free' : ' locked')} style={st.opacity !== undefined && st.opacity < 1 ? { opacity: st.opacity } : undefined}>
    <div className="rwin-head" title={free ? 'Тягни за заголовок, щоб пересунути' : 'Зафіксовано — відкрий Alt+Q, щоб пересунути'}>
      <b>{all ? `Правила · ${st.tabs.length}` : 'Правило'}</b>
      <div className="rwin-tabs" role="tablist">
        {!all && st.tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={t.id === cur?.id} className={'rwin-tab' + (t.id === cur?.id ? ' on' : '')}
          title={`${KIND[t.kind]} · ${t.topic}${t.n ? ' · ' + numLabel(t.kind, t.n) : ''}`} onClick={() => { if (free) api.ruleTab(t.id).catch(() => {}); }}>
          <span>{tabLabel(t)}</span>
          {free && <i role="button" aria-label="Закрити вкладку" onClick={e => { e.stopPropagation(); api.ruleCloseTab(t.id).catch(() => {}); }}><Icon name="x" size={11} /></i>}
        </button>)}
      </div>
      {free ? <>
        {st.tabs.length > 1 && <button type="button" className={'rwin-x' + (st.all ? ' on' : '')} aria-pressed={!!st.all}
          title={st.all ? 'Вкладками — по одному пункту' : 'Усі разом — пункти один під одним'} onClick={() => api.ruleOpts({ all: !st.all }).catch(() => {})}><Icon name="layers" size={15} /></button>}
        <button type="button" className={'rwin-x' + (keep ? ' on' : '')} aria-pressed={keep}
          title={keep ? 'Лишається поверх гри, коли закриєш Alt+Q. Натисни — ховати разом з Alt+Q' : 'Ховається разом з Alt+Q. Натисни — лишати поверх гри'}
          onClick={() => api.ruleOpts({ keep: !keep }).catch(() => {})}><Icon name={keep ? 'eye' : 'eyeoff'} size={16} /></button>
        <button type="button" className="rwin-x" aria-label="Закрити вікно" title="Закрити вікно" onClick={() => api.ruleClose().catch(() => {})}><Icon name="x" size={15} /></button>
      </> : <span className="rwin-lock">Alt+Q — рухати</span>}
    </div>
    {note && <div className="rwin-note" role="status">{note}</div>}
    {cur && <div className="rwin-body"><div className="rwin-in" ref={inner}>
      {all ? st.tabs.map(t => <Rule key={t.id} t={t} onClose={free ? () => { api.ruleCloseTab(t.id).catch(() => {}); } : undefined} />) : <Rule t={cur} />}
    </div></div>}
  </div></div>;
}
