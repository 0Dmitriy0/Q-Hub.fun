import { useEffect, useRef, useState, type DragEvent } from 'react';
import Icon from '../components/Icon';
import { splitPenalty } from './barParts';
import { abbrsOf, KIND, numLabel, type RuleKind } from './rulesSearch';

/* окреме вікно з правилами (specs/084, contracts/rule-window.md): до 5 вкладок, у кожній до 5 правил.
   Правила й вкладки збираються перетягуванням (затиснув ЛКМ): на вкладку — у її кінець, на правило — вище чи нижче нього,
   на «+» — у нову вкладку; затримався над вкладкою — вона відкривається, щоб покласти між її правилами.
   Стан дає головний процес; locked — Alt+Q закрита: вікно зафіксоване, кнопок і перетягування немає, кліки йдуть у гру.
   keep — око: лишати поверх гри, коли Alt+Q закрита */
interface Rule { id: string; topic: string; url: string; kind: RuleKind; n: string; h: string; s: string }
interface Group { id: string; rules: Rule[] }
interface State { groups: Group[]; active: string | null; note: string | null; locked: boolean; opacity?: number; keep?: boolean }
type Src = { rule: string } | { group: string };
type To = { group: string; anchor?: string; pos?: 'before' | 'after' } | { newGroup: true };
interface RuleApi {
  ruleState(): Promise<State | null>; onRuleState(cb: (s: State) => void): () => void;
  ruleTab(id: string): Promise<void>; ruleCloseTab(id: string): Promise<void>; ruleClose(): Promise<void>; ruleSize(h: number): Promise<void>;
  ruleOpts(p: { keep?: boolean }): Promise<void>; ruleRemove(id: string): Promise<void>; ruleMove(src: Src, to: To): Promise<void>;
}
const api = (window as unknown as { qhub: RuleApi }).qhub;
const MAX_TABS = 5, MAX_RULES = 5;

/* підпис: «КК ст. 6.7» — скорочення документа й номер; у вкладці з кількома правилами — «+2» */
const ruleLabel = (r: Rule) => [abbrsOf(r.topic)[0]?.toUpperCase() || r.topic.slice(0, 14), numLabel(r.kind, r.n)].filter(Boolean).join(' ');
const tabTitle = (g: Group) => g.rules.map(r => `${KIND[r.kind]} · ${r.topic}${r.n ? ' · ' + numLabel(r.kind, r.n) : ''}`).join('\n');

export default function RuleWin() {
  const [st, setSt] = useState<State>({ groups: [], active: null, note: null, locked: true });
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const take = (s: State | null) => { if (!s) return; setSt(s); if (s.note) setNote(s.note); };
    api.ruleState().then(take).catch(() => {});
    return api.onRuleState(take);
  }, []);
  /* примітка («найстарішу закрито», «до 5 правил») — на 4 с */
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 4000); return () => clearTimeout(t); }, [note]);

  /* ---------- перетягування ---------- */
  const drag = useRef<Src | null>(null);
  const [dragging, setDragging] = useState<Src | null>(null);
  const [over, setOver] = useState<string | null>(null);   // вкладка чи «+» під курсором
  const [line, setLine] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);   // куди ляже правило
  const hoverT = useRef<number | undefined>(undefined);
  const start = (e: DragEvent, s: Src) => { drag.current = s; setDragging(s); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'q-hub-rule'); };
  const end = () => { drag.current = null; setDragging(null); setOver(null); setLine(null); clearTimeout(hoverT.current); };
  const drop = (to: To) => { const s = drag.current; end(); if (s) api.ruleMove(s, to).catch(() => {}); };
  const srcGroup = (s: Src | null) => (!s ? null : 'group' in s ? s.group : st.groups.find(g => g.rules.some(r => r.id === s.rule))?.id ?? null);

  /* висота вікна — під вміст: .rwrap висотою з вміст (обрізаний вікном) + те, що сховано під прокруткою;
     головний процес обріже до половини екрана (кілька правил у вкладці — до 85 %) */
  const wrap = useRef<HTMLDivElement>(null), win = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const cur = st.groups.find(g => g.id === st.active) || st.groups[st.groups.length - 1];
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
  }, [st.active, st.groups.length, cur?.rules.length, note]);

  const free = !st.locked, keep = st.keep !== false;
  /* «+» — нова вкладка: тягнуть одне правило з вкладки, де їх кілька, і вкладок ще менше 5 */
  const from = srcGroup(dragging), fromG = st.groups.find(g => g.id === from);
  const plus = free && !!dragging && 'rule' in dragging && (fromG?.rules.length ?? 0) > 1 && st.groups.length < MAX_TABS;

  return <div className="rwrap" ref={wrap}><div ref={win} className={'rwin' + (free ? ' free' : ' locked') + (dragging ? ' dragging' : '')} style={st.opacity !== undefined && st.opacity < 1 ? { opacity: st.opacity } : undefined}>
    <div className="rwin-head" title={free ? 'Тягни за заголовок, щоб пересунути вікно' : 'Зафіксовано — відкрий Alt+Q, щоб пересунути'}>
      <b>Правило</b>
      <div className="rwin-tabs" role="tablist">
        {st.groups.map(g => {
          const can = !!dragging && from !== g.id;
          return <button key={g.id} type="button" role="tab" aria-selected={g.id === cur?.id} title={tabTitle(g) + (free ? '\n\nЗатисни й перетягни — у іншу вкладку чи між правилами' : '')}
            className={'rwin-tab' + (g.id === cur?.id ? ' on' : '') + (over === g.id ? ' over' : '')} draggable={free}
            onDragStart={e => start(e, { group: g.id })} onDragEnd={end}
            onDragOver={e => { if (!can) return; e.preventDefault(); if (over !== g.id) { setOver(g.id); clearTimeout(hoverT.current); hoverT.current = window.setTimeout(() => { if (g.id !== cur?.id) api.ruleTab(g.id).catch(() => {}); }, 600); } }}
            onDragLeave={() => { if (over === g.id) { setOver(null); clearTimeout(hoverT.current); } }}
            onDrop={e => { e.preventDefault(); drop({ group: g.id }); }}
            onClick={() => { if (free) api.ruleTab(g.id).catch(() => {}); }}>
            <span>{ruleLabel(g.rules[0])}{g.rules.length > 1 && <em> +{g.rules.length - 1}</em>}</span>
            {free && <i role="button" aria-label="Закрити вкладку" onClick={e => { e.stopPropagation(); api.ruleCloseTab(g.id).catch(() => {}); }}><Icon name="x" size={11} /></i>}
          </button>;
        })}
        {plus && <span className={'rwin-tab plus' + (over === '+' ? ' over' : '')} title="Відпусти — нова вкладка"
          onDragOver={e => { e.preventDefault(); setOver('+'); }} onDragLeave={() => setOver(null)}
          onDrop={e => { e.preventDefault(); drop({ newGroup: true }); }}><Icon name="plus" size={12} /></span>}
      </div>
      {free ? <>
        <button type="button" className={'rwin-x' + (keep ? ' on' : '')} aria-pressed={keep}
          title={keep ? 'Лишається поверх гри, коли закриєш Alt+Q. Натисни — ховати разом з Alt+Q' : 'Ховається разом з Alt+Q. Натисни — лишати поверх гри'}
          onClick={() => api.ruleOpts({ keep: !keep }).catch(() => {})}><Icon name={keep ? 'eye' : 'eyeoff'} size={16} /></button>
        <button type="button" className="rwin-x" aria-label="Закрити вікно" title="Закрити вікно" onClick={() => api.ruleClose().catch(() => {})}><Icon name="x" size={15} /></button>
      </> : <span className="rwin-lock">Alt+Q — рухати</span>}
    </div>
    {note && <div className="rwin-note" role="status">{note}</div>}
    {cur && <div className="rwin-body"><div className="rwin-in" ref={inner}
      /* відпустив нижче останнього правила — у кінець вкладки */
      onDragOver={e => { if (dragging && from !== cur.id && e.target === e.currentTarget) e.preventDefault(); }}
      onDrop={e => { if (e.target === e.currentTarget) { e.preventDefault(); drop({ group: cur.id }); } }}>
      {cur.rules.map(r => {
        const { body, pen, more } = splitPenalty(r.s);
        const self = !!dragging && 'rule' in dragging && dragging.rule === r.id;
        const full = !!dragging && from !== cur.id && cur.rules.length >= MAX_RULES;
        return <div key={r.id} className={'rwin-rule' + (self ? ' self' : '') + (line?.id === r.id ? ' drop-' + line.pos : '')} draggable={free}
          title={free ? 'Затисни й перетягни — на вкладку, вище чи нижче іншого правила' : undefined}
          onDragStart={e => start(e, { rule: r.id })} onDragEnd={end}
          onDragOver={e => {
            if (!dragging || self || full) return;
            e.preventDefault(); e.stopPropagation();
            const b = e.currentTarget.getBoundingClientRect(), pos = e.clientY < b.top + b.height / 2 ? 'before' : 'after';
            if (line?.id !== r.id || line.pos !== pos) setLine({ id: r.id, pos });
          }}
          onDragLeave={() => { if (line?.id === r.id) setLine(null); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); drop({ group: cur.id, anchor: r.id, pos: line?.id === r.id ? line.pos : 'after' }); }}>
          <div className="brule-top">
            <span className={'bkindtag ' + r.kind}>{KIND[r.kind]}</span>
            {r.n && <span className="bpunkt">{numLabel(r.kind, r.n)}</span>}
            {r.url ? <a href={r.url} target="_blank" rel="noreferrer" draggable={false} title="Відкрити тему на форумі">{r.topic}</a> : <a>{r.topic}</a>}
            {free && cur.rules.length > 1 && <button type="button" className="rwin-x sm" aria-label="Прибрати правило" title="Прибрати правило з вкладки"
              onClick={() => api.ruleRemove(r.id).catch(() => {})}><Icon name="x" size={12} /></button>}
          </div>
          <p>{body}</p>
          {pen && <span className="bpen">{pen}</span>}
          {more && <p className="bextra">{more}</p>}
        </div>;
      })}
    </div></div>}
  </div></div>;
}
