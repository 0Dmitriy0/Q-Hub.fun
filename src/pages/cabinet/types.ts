import type { Character } from '../../lib/auth';
export type { Character };
export interface Tx { id: string; character_id: string; type: 'in' | 'out'; amount: number; category: string; note: string; source: string; ts: string; account?: 'cash' | 'card' }
export interface DealRow { id: string; character_id: string; op: 'buy' | 'farm' | 'sell'; item: string; qty: number; price: number; category: string; receipt_id: string | null; tx_id: string | null; ts: string }
export interface Car { id: string; character_id: string; name: string; plate: string; gov: number; paid: number; tune: string; note: string; status: 'own' | 'sold'; sold_price: number; sold_at: string | null; pos: number }
