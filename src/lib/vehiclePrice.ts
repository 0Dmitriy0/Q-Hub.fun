import { fmt, money } from './format';

/* Ціна транспорту в салоні з урахуванням валюти: ігрові долари, донатна валюта або ексклюзив (у салоні не купити). */
export interface PriceSrc { price: number; salon_price?: number | null; exclusive?: boolean; currency?: 'game' | 'donate' }
export type PriceKind = 'game' | 'donate' | 'exclusive';

export const priceKind = (v: PriceSrc): PriceKind => (v.exclusive ? 'exclusive' : v.currency === 'donate' ? 'donate' : 'game');
export const salonAmount = (v: PriceSrc) => (v.exclusive ? null : v.salon_price ?? (v.currency === 'donate' ? null : v.price || null));
export const donate = (n: number) => fmt(n) + ' донат';
export const salonLabel = (v: PriceSrc) => { const k = priceKind(v), a = salonAmount(v); return k === 'exclusive' ? 'Ексклюзив' : a == null ? '—' : k === 'donate' ? donate(a) : money(a); };

/* порядок «за ціною»: спершу ігрова валюта від дорожчих, далі донатна, далі ексклюзиви (за держ. ціною) */
export const priceSortKey = (v: PriceSrc): [number, number] => { const k = priceKind(v); return [k === 'game' ? 0 : k === 'donate' ? 1 : 2, k === 'exclusive' ? v.price || 0 : salonAmount(v) ?? 0]; };
