import { useEffect, useMemo, useRef, useState } from 'react';
import { money, qty as fq } from '../lib/format';
import { manualLine, saleGuess, type SaleItem, type SaleLine } from '../lib/saleGuess';

/* Продаж скупнику, який записав автооблік, → «списати зі складу?» над рядком плашки (specs/030, contracts/bar-sale.md).
   Склад змінюється лише після Enter гравця (принцип IV); 10 с після цього — «Скасувати». */

export interface Sale { txId: string; amount: number; buyerId: string | null; buyer: string | null; items: SaleItem[]; at: number }
interface SaleApi {
  saleConfirm(txId: string, lines: SaleLine[]): Promise<string | null>;
  saleDecline(txId: string): Promise<void>;
  saleUndo(txId: string): Promise<string | null>;
}
const api = (window as unknown as { qhub: SaleApi }).qhub;
const UNDO_S = 10;

const lineText = (l: SaleLine) => `${l.item} × ${fq(l.qty)}`;

export default function SaleCard({ sales, stock, changed }: { sales: Sale[]; stock: Record<string, number>; changed: () => void }) {
  const s = sales[0] ?? null;
  const guess = useMemo(() => (s ? saleGuess(s.amount, s.items, stock) : null), [s, stock]);
  const [pick, setPick] = useState(''); const [n, setN] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ txId: string; text: string; left: number } | null>(null);
  const yes = useRef<HTMLButtonElement>(null), sel = useRef<HTMLSelectElement>(null);

  /* нова пропозиція — фокус на ній: Enter підтверджує, Esc відхиляє */
  useEffect(() => {
    setErr(''); setN('');
    setPick(guess?.kind === 'manual' ? guess.items[0]?.item ?? '' : '');
    setTimeout(() => (guess?.kind === 'manual' ? sel.current : yes.current)?.focus(), 0);
  }, [s?.txId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!undo) return;
    if (undo.left <= 0) { setUndo(null); return; }
    const t = setTimeout(() => setUndo(u => (u ? { ...u, left: u.left - 1 } : u)), 1000);
    return () => clearTimeout(t);
  }, [undo]);

  if (undo) return (
    <div className="bsale" role="status">
      <span className="bsale-t">Списано: {undo.text}</span>
      {err && <small className="bad">{err}</small>}
      <button type="button" className="btn sm ghost" disabled={busy} onClick={async () => {
        setBusy(true); const e = await api.saleUndo(undo.txId); setBusy(false);
        if (e) { setErr(e); return; }
        setUndo(null); setErr(''); changed();
      }}>Скасувати · {undo.left} с</button>
    </div>
  );
  if (!s || !guess) return null;

  const have = (i: string) => stock[i] || 0;
  const lines: SaleLine[] | null = guess.kind !== 'manual' ? guess.lines
    : pick && Number(n.replace(',', '.')) > 0 ? [manualLine(pick, Number(n.replace(',', '.')), s.amount, have(pick))] : null;

  async function confirm() {
    if (!s || !lines) { setErr('Обери товар і кількість.'); return; }
    setBusy(true); setErr('');
    const e = await api.saleConfirm(s.txId, lines);
    setBusy(false);
    if (e) { setErr(e); return; }
    setUndo({ txId: s.txId, text: lines.map(lineText).join(', '), left: UNDO_S });
    changed();
  }
  async function decline() { if (!s) return; await api.saleDecline(s.txId); changed(); }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); decline(); }
    else if (e.key === 'Enter' && !busy) { e.preventDefault(); e.stopPropagation(); confirm(); }
  }

  const farm = lines?.some(l => l.farm > 0);
  return (
    <div className="bsale" onKeyDown={onKey}>
      <span className="bsale-t">
        <b className="good">+{money(s.amount)}</b>{s.buyer ? ` · ${s.buyer}` : ''}
        {guess.kind === 'one' && <> — {farm ? 'нафармив і продав' : 'продав'} <b>{lineText(guess.lines[0])}</b> по {money(guess.lines[0].price)}</>}
        {guess.kind === 'all' && <> — продав усе: <b>{guess.lines.map(lineText).join(', ')}</b></>}
        {guess.kind === 'manual' && <> — що продав?</>}
        {sales.length > 1 && <small className="muted"> · ще {sales.length - 1}</small>}
      </span>
      {guess.kind === 'manual' && <>
        <select ref={sel} value={pick} onChange={e => setPick(e.target.value)} aria-label="Товар">
          {guess.items.map(i => <option key={i.item} value={i.item}>{i.item}{i.have ? ` · на складі ${fq(i.have)}` : ''}</option>)}
        </select>
        <input className="bsale-n" value={n} onChange={e => setN(e.target.value)} inputMode="decimal" placeholder="скільки" aria-label="Кількість" />
      </>}
      {err && <small className="bad">{err}</small>}
      <button ref={yes} type="button" className="btn sm acc" disabled={busy || !lines} onClick={confirm} title="Enter">Списати зі складу</button>
      <button type="button" className="btn sm ghost" disabled={busy} onClick={decline} title="Esc">Ні</button>
    </div>
  );
}
