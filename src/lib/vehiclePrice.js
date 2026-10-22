import { fmt, money } from './format';
export const priceKind = (v) => (v.exclusive ? 'exclusive' : v.currency === 'donate' ? 'donate' : 'game');
export const salonAmount = (v) => (v.exclusive ? null : v.salon_price ?? (v.currency === 'donate' ? null : v.price || null));
export const donate = (n) => fmt(n) + ' донат';
export const salonLabel = (v) => { const k = priceKind(v), a = salonAmount(v); return k === 'exclusive' ? 'Ексклюзив' : a == null ? '—' : k === 'donate' ? donate(a) : money(a); };
/* порядок «за ціною»: спершу ігрова валюта від дорожчих, далі донатна, далі ексклюзиви (за держ. ціною) */
export const priceSortKey = (v) => { const k = priceKind(v); return [k === 'game' ? 0 : k === 'donate' ? 1 : 2, k === 'exclusive' ? v.price || 0 : salonAmount(v) ?? 0]; };
