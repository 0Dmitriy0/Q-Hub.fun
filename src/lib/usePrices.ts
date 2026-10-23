import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { BuyerPrice } from './advice';

/* ціни скупників з сайту — для дашборда, складу й «що вигідно»; вантажаться раз на відкриття кабінету */
export interface CatalogPrice extends BuyerPrice { buyerId: string; unit: string; icon: string }
interface Row { buyer_id: string; min_price: number; max_price: number; price: number; price_at: string | null; buyers: { name: string; sort: number } | null; items: { name: string; unit: string; image_url: string } | null }

let cache: Promise<CatalogPrice[]> | null = null;
function load(): Promise<CatalogPrice[]> {
  if (!supabase) return Promise.resolve([]);
  return cache ??= Promise.resolve(supabase.from('buyer_items').select('buyer_id,min_price,max_price,price,price_at,buyers(name,sort),items(name,unit,image_url)'))
    .then(({ data, error }) => {
      if (error) { cache = null; throw error; }
      return (data as unknown as Row[]).filter(r => r.buyers && r.items).map(r => ({
        buyerId: r.buyer_id, buyer: r.buyers!.name, item: r.items!.name, unit: r.items!.unit || 'шт', icon: r.items!.image_url || '',
        price: Number(r.price) || 0, min: Number(r.min_price) || 0, max: Number(r.max_price) || 0, at: r.price_at,
      }));
    });
}

export function usePrices() {
  const [prices, setPrices] = useState<CatalogPrice[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    load().then(p => live && setPrices(p), () => { if (live) { setError('Не вдалося завантажити ціни скупників.'); setPrices([]); } });
    return () => { live = false; };
  }, []);
  return { prices, error };
}
