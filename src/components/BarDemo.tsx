import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { loadMapData } from '../lib/mapMarks';
import { buyers, places, type BarPrice, type PlaceHit } from '../desktop/barSearch';
import { searchRules, type RuleHit, type RuleTopic } from '../desktop/rulesSearch';
import { CopyBtn, placesText, Prices, Rich, RuleCard, rulesText } from '../desktop/barParts';
import { plainText } from '../desktop/richText';
import RULES from '../data/rules.json';
import '../desktop/bar.css';

/* Плашка Alt+Q на сторінці «Програма» — та сама розмітка й стилі, що в програмі (desktop/Bar.tsx, bar.css),
   і той самий пошук: правила й закони з rules.json, місця з мапи, ціни скупників з бази.
   ШІ, історія, мапа поверх гри й кабінет є лише в програмі — тут значки без дії */
const TOPICS = (RULES as { fetched: string; topics: RuleTopic[] }).topics;
const AT = (RULES as { fetched: string }).fetched;
const rulesDay = new Date(AT.length === 10 ? AT + 'T12:00:00' : AT).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });

interface Ask { q: string; reply: string; hits?: RuleHit[]; places?: PlaceHit[]; local?: boolean }
/* у тому самому форматі, що й справжня відповідь ШІ в програмі (specs/085): головна думка, список, жирне — без вигаданих пунктів правил */
const AI_ONLY = [
  'Питання до ШІ своїми словами працює **в програмі Q-Hub** — на сайті лише пошук без ШІ.',
  '- У програмі: Alt+Q поверх гри, **Shift+Enter** — ШІ відповість з правил сервера й законів штату і покаже пункт, звідки взяв відповідь',
  '- Тут: натисни **Enter** — знайде пункти правил, закони й місця на мапі',
].join('\n');
export const EXAMPLES: [string, 'ai' | 'prices'][] = [
  ['адвокат при затриманні', 'ai'], ['обшук', 'ai'], ['КК 1.8', 'ai'], ['хабар', 'ai'], ['зелена зона', 'ai'], ['риба', 'prices'],
];

type Marks = { marks: Parameters<typeof places>[1]; cats: Parameters<typeof places>[2] };
let marksP: Promise<Marks | null> | null = null;
const loadMarks = () => (marksP ??= loadMapData().then(m => (m ? { marks: m.marks, cats: m.cats } : null)).catch(() => null));
let pricesP: Promise<BarPrice[]> | null = null;
/* те саме, що barPrices() у desktop/src/main.cjs, без непідтверджених цін */
const loadPrices = () => (pricesP ??= !supabase ? Promise.resolve([]) : Promise.resolve(
  supabase.from('buyer_items').select('price,min_price,max_price,price_at,buyers(name,image_url),items(name,unit,image_url,sub)')
).then(({ data }) => ((data || []) as unknown as { price: number; min_price: number; max_price: number; price_at: string | null; buyers: { name: string; image_url: string | null } | null; items: { name: string; unit: string | null; image_url: string | null; sub: string | null } | null }[])
  .filter(r => r.buyers && r.items).map(r => ({
    item: r.items!.name, unit: r.items!.unit || 'шт', icon: r.items!.image_url || '', sub: r.items!.sub || '', buyer: r.buyers!.name, buyerIcon: r.buyers!.image_url || '',
    price: Number(r.price) || 0, min: Number(r.min_price) || 0, max: Number(r.max_price) || 0, at: r.price_at,
  })), () => []));

async function rulesAsk(text: string): Promise<Ask> {
  const m = await loadMarks();
  const pl = m ? places(text, m.marks, m.cats) : [];
  const hits = searchRules(TOPICS, text);
  return { q: text, reply: hits.length || pl.length ? '' : 'У правилах, законах і на мапі такого не знайшов. Спробуй інакше або Shift+Enter — спитати ШІ.', hits, places: pl };
}

export default function BarDemo({ pick }: { pick?: { q: string; mode: 'ai' | 'prices'; n: number } }) {
  const { nick, current } = useAuth();
  const ch = current;
  const [q, setQ] = useState(EXAMPLES[0][0]);
  const [mode, setMode] = useState<'ai' | 'prices'>('ai');
  const [shift, setShift] = useState(false);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [sel, setSel] = useState(0);
  const [prices, setPrices] = useState<BarPrice[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run = async (text: string, ai = false) => {
    const t = text.trim(); if (!t) return;
    const a = ai ? { q: t, reply: AI_ONLY, local: true } : await rulesAsk(t);
    setAsks(x => [a, ...x.filter(y => y.q !== t || y.local !== a.local)].slice(0, 12)); setSel(0);
  };
  useEffect(() => { run(EXAMPLES[0][0]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'prices' && !prices) loadPrices().then(setPrices); }, [mode, prices]);
  /* приклад під плашкою: вписати запит і показати результат */
  useEffect(() => {
    if (!pick) return;
    setQ(pick.q); setMode(pick.mode);
    if (pick.mode === 'ai') run(pick.q); else setSel(0);
  }, [pick]); // eslint-disable-line react-hooks/exhaustive-deps

  const hits = useMemo(() => (prices && mode === 'prices' ? buyers(prices, q) : []), [prices, q, mode]);
  const cur = hits[sel] ?? hits[0] ?? null;
  const aiNext = mode === 'ai' && shift;
  const a = asks[sel];
  const who = nick || 'Твій нік';

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Shift') setShift(true);
    if (e.key === 'Enter' && mode === 'ai') { e.preventDefault(); run(q, e.shiftKey); }
    if (mode === 'prices' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && hits.length) {
      e.preventDefault(); setSel(s => (s + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length);
    }
  }

  return (
    <div className="bwrap p-bar">
      <div className="bbox">
        <div className="bbar">
          <span className="blogo" aria-hidden="true"><img src="/brand/q-hub-logo.svg" alt="" width={30} height={30} /></span>
          <span className={'blead' + (aiNext ? ' ai' : '')} aria-hidden="true"><Icon name={mode === 'prices' ? 'tag' : aiNext ? 'spark' : 'search'} size={18} /></span>
          <input ref={input} value={q} spellCheck={false} onChange={e => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
            onKeyUp={e => { if (e.key === 'Shift') setShift(false); }} onBlur={() => setShift(false)}
            placeholder={mode === 'ai' ? (aiNext ? 'Спитай ШІ своїми словами…' : 'Правило сервера, закон штату або питання') : 'Скупник чи товар: шкури, риба, глива…'} aria-label="Запит — спробуй, як у програмі" />
          {q && <button type="button" className="bico" title="Очистити" aria-label="Очистити" onClick={() => { setQ(''); input.current?.focus(); }}><Icon name="x" size={15} /></button>}
          <div className="bseg" role="group" aria-label="Режим">
            <button type="button" aria-pressed={mode === 'ai'} onClick={() => { setMode('ai'); setSel(0); }}><Icon name="search" size={14} />Пошук</button>
            <button type="button" aria-pressed={mode === 'prices'} onClick={() => { setMode('prices'); setSel(0); }}><Icon name="tag" size={14} />Ціни</button>
          </div>
          <span className="bchar p-bar-x" aria-hidden="true">
            <span className="bpill"><span className="bava">{who[0]}</span><span className="bwho"><b>{who}</b><small>{ch ? ch.name + (ch.static_id ? ' #' + ch.static_id : '') : 'Персонаж'}</small></span><Icon name="chev" size={14} /></span>
          </span>
          {/* у програмі: закріпити, історія, мапа, клавіші, налаштування — тут лише вигляд */}
          <span className="p-bar-x" aria-hidden="true" style={{ display: 'contents' }}>
            <span className="bsep" />
            {['pin', 'history', 'map', 'help', 'gear'].map(i => <span key={i} className="bico"><Icon name={i} size={17} /></span>)}
          </span>
        </div>

        <div className="bpanes">
          {mode === 'prices' ? (prices ? <Prices hits={hits} setSel={setSel} cur={cur} q={q} /> : <div className="bempty">Завантажую ціни скупників…</div>) : <>
            <div className="bleft">
              {asks.map((x, i) => <button type="button" key={x.q + i} className={'brow item' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}>
                <span className={'bkico ' + (x.local ? 'ai' : 'rules')}><Icon name={x.local ? 'spark' : 'search'} size={15} /></span>
                <span><b>{x.q}</b><small>{x.local ? 'ШІ — у програмі' : x.hits?.length || x.places?.length ? [x.places?.length && `місця · ${x.places.length}`, x.hits?.length && `правила · ${x.hits.length}`].filter(Boolean).join(' · ') : 'нічого не знайдено'}</small></span>
              </button>)}
            </div>
            <div className="bright">{a && (a.local ? <>
              <div className="bkind ai brow-h"><Icon name="spark" size={14} />Відповідь ШІ</div>
              <div className="bans"><Rich text={a.reply} /><CopyBtn icon text={plainText(a.reply)} label="Копіювати відповідь" /></div>
              <p className="bfine">ШІ відповідає з правил сервера, але може помилятися — перевір пункт на форумі.</p>
            </> : <>
              {a.places && a.places.length > 0 && <>
                <div className="bkind brow-h"><Icon name="map" size={14} />Місця на мапі · у програмі клік показує мітку на мапі поверх гри<CopyBtn text={placesText(a.places)} label="Копіювати місця з координатами" /></div>
                <ul className="bplaces">{a.places.map(h => <li key={h.id}><span className="brow item">
                  <img src={h.icon} alt="" width={22} height={22} /><span><b>{h.name}</b><small>{h.cat} · X {Math.round(h.x)} · Y {Math.round(h.y)}</small></span></span></li>)}</ul>
              </>}
              {(a.hits!.length > 0 || !a.places?.length) && <div className="bkind brow-h"><Icon name="search" size={14} />Правила й закони{a.hits!.length ? ` · ${a.hits!.length} збігів` : ''} · станом на {rulesDay}
                {a.hits!.length > 1 && <CopyBtn text={rulesText(a.hits!)} label="Копіювати всі знайдені пункти" short="Копіювати все" />}</div>}
              {a.reply && <p className="bnone">{a.reply}</p>}
              {a.hits!.length > 0 && <ul className="brules">{a.hits!.map((h, i) => <RuleCard key={a.q + i} h={h} />)}</ul>}
              <p className="btip"><Icon name="spark" size={14} />Не те? <kbd>Shift</kbd>+<kbd>Enter</kbd> — спитати ШІ своїми словами</p>
            </>)}</div>
          </>}
        </div>

        <div className="bhint">
          <span>{mode === 'ai' ? (aiNext ? 'Enter зараз спитає ШІ' : 'Шукає в правилах сервера й законах штату, без ШІ') : 'Назви скупника чи товар — ціни, межі й коли їх оновили'}</span>
          <span className="bkeys">{mode === 'ai'
            ? <><span className={aiNext ? '' : 'on'}><kbd>Enter</kbd>пошук</span><span className={aiNext ? 'on ai' : ''}><kbd>Shift</kbd><kbd>Enter</kbd>ШІ</span></>
            : <span className="on"><kbd>↑</kbd><kbd>↓</kbd>вибір</span>}
            <span><kbd>Tab</kbd>{mode === 'ai' ? 'ціни' : 'пошук'}</span><span><kbd>Esc</kbd>сховати</span></span>
        </div>
      </div>
    </div>
  );
}
