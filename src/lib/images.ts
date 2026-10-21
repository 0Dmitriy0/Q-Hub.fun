import { supabase } from './supabase';

/* картинка → квадрат до 256 px у WebP (≈10–30 КБ) і в публічне сховище «catalog»; повертає адресу */
export async function uploadCatalogImage(file: File, path: string): Promise<string> {
  if (!supabase) throw new Error('немає бази');
  if (!file.type.startsWith('image/')) throw new Error('Це не картинка');
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), size = Math.min(256, side);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  const blob: Blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('не вдалося стиснути'))), 'image/webp', 0.85));
  const { error } = await supabase.storage.from('catalog').upload(path, blob, { upsert: true, contentType: 'image/webp', cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from('catalog').getPublicUrl(path);
  return data.publicUrl + '?v=' + Date.now();   // нова версія одразу, без старого кешу
}
