/* Списання продажу скупнику (specs/030): пропозиції в пам'яті й черга угод на диску. Без Electron — перевіряється salequeue.test.cjs.
   Пропозиція: pending → confirmed | declined | expired (10 хв); confirmed → undone лише перші 10 с. Після перезапуску пропозицій
   немає, і запис обліку лишається як є — краще нічого, ніж вигадане (принцип IV). */
const fs = require('node:fs');

const TTL = 10 * 60e3, UNDO = 10e3;

/* рядки з плашки: null — гаразд, рядок — помилка для гравця. Запас Σ qty покриває округлення ціни при ручному виборі */
function validate(lines, amount) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 50) return 'Нема що списувати.';
  let sum = 0, qty = 0;
  for (const l of lines) {
    if (!l || typeof l.item !== 'string' || !l.item.trim() || l.item.trim().length > 80) return 'Обери товар.';
    if (!(Number(l.qty) > 0)) return 'Вкажи кількість.';
    if (!(Number(l.farm) >= 0) || Number(l.farm) > Number(l.qty)) return 'Хибна кількість.';
    if (!Number.isInteger(l.price) || l.price < 0) return 'Хибна ціна.';
    sum += Number(l.qty) * l.price; qty += Number(l.qty);
  }
  return Math.abs(sum - amount) <= Math.max(1, qty) ? null : 'Сума не збігається з продажем.';
}

/* угоди для бази: «Нафармив» на 1 мс раніше (склад спершу поповнюється), потім «Продав»; external_id не дає дубля при повторі (принцип V) */
function dealRows(txId, lines, at, character) {
  const ts = ms => new Date(ms).toISOString(), out = [];
  lines.forEach((l, n) => {
    const base = { character_id: character, item: l.item.trim(), category: '', tx_id: txId };
    const q = v => Math.round(Number(v) * 100) / 100;
    if (Number(l.farm) > 0) out.push({ ...base, op: 'farm', qty: q(l.farm), price: 0, ts: ts(at - 1), external_id: `sale:${txId}:${n}:farm` });
    out.push({ ...base, op: 'sell', qty: q(l.qty), price: l.price, ts: ts(at), external_id: `sale:${txId}:${n}:sell` });
  });
  return out;
}

function saleQueue(now = Date.now) {
  const m = new Map();   // txId → { sale, state, at }
  const sweep = () => { for (const [id, s] of m) if (s.state === 'pending' ? now() - s.sale.at > TTL : now() - s.at > UNDO) m.delete(id); };
  return {
    /* новий продаж; false — уже є (той самий запис обліку двічі не пропонується) */
    add(sale) { sweep(); if (!sale?.txId || m.has(sale.txId)) return false; m.set(sale.txId, { sale, state: 'pending', at: now() }); return true; },
    pending() { sweep(); return [...m.values()].filter(s => s.state === 'pending').map(s => s.sale); },
    get(txId) { sweep(); return m.get(txId)?.sale || null; },
    state(txId) { sweep(); return m.get(txId)?.state || 'expired'; },
    confirm(txId) { sweep(); const s = m.get(txId); if (s?.state !== 'pending') return false; s.state = 'confirmed'; s.at = now(); return true; },
    /* помилка запису — пропозиція знову чекає */
    reopen(txId) { const s = m.get(txId); if (s) { s.state = 'pending'; s.at = now(); } },
    decline(txId) { sweep(); const s = m.get(txId); if (s?.state !== 'pending') return false; m.delete(txId); return true; },
    undo(txId) { sweep(); const s = m.get(txId); if (s?.state !== 'confirmed' || now() - s.at > UNDO) return false; m.delete(txId); return true; },
  };
}

/* черга угод без зв'язку: [{ txId, rows }] у файлі. send(rows) → 'ok' | 'retry' */
function outQueue(file) {
  const load = () => { try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(v) ? v : []; } catch { return []; } };
  const save = list => { try { if (list.length) fs.writeFileSync(file, JSON.stringify(list)); else fs.rmSync(file, { force: true }); } catch { /* наступна спроба */ } };
  let running = null;
  return {
    put(txId, rows) { const list = load().filter(x => x.txId !== txId); list.push({ txId, rows }); save(list); },
    /* true — було в черзі й прибрано (ще не відправлено) */
    drop(txId) { const list = load(), left = list.filter(x => x.txId !== txId); save(left); return left.length !== list.length; },
    size: () => load().length,
    flush(send) {
      if (!running) running = (async () => {
        for (const x of load()) {
          let r; try { r = await send(x.rows); } catch { r = 'retry'; }
          if (r === 'ok') save(load().filter(y => y.txId !== x.txId));
        }
      })().finally(() => { running = null; });
      return running;
    },
  };
}

module.exports = { validate, dealRows, saleQueue, outQueue, TTL, UNDO };
