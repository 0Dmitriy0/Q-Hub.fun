/* псевдоніми товарів (specs/039, research R3): назва, яку зір читає з помилкою, а адмін у панелі позначив «Це вже є: <товар>».
   Для зіставлення назв кожен псевдонім стає ще одним «ім'ям» того самого товару (той самий id — ціна йде в правильний товар).
   Порахунок товарів скупника (покриття) робиться з початкового списку, без цих копій. */
function expandAliases(items) {
  const out = [];
  for (const it of items) {
    out.push(it);
    const seen = new Set([String(it.name).toLowerCase()]);
    for (const a of it.aliases || []) {
      const k = String(a || '').trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ ...it, name: String(a).trim(), alias: true });
    }
  }
  return out;
}
module.exports = { expandAliases };
