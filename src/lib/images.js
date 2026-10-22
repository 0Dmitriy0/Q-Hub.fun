import { supabase } from './supabase';
/* createImageBitmap є не скрізь (старі Safari) — тоді розкодовуємо через <img> */
async function decode(file) {
    try {
        return await createImageBitmap(file);
    }
    catch {
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            img.src = url;
            await img.decode();
            return img;
        }
        catch {
            throw new Error('Цей формат картинки не підтримується. Збережи її як JPG або PNG.');
        }
        finally {
            URL.revokeObjectURL(url);
        }
    }
}
/* картинка → кадр потрібних пропорцій (за замовчуванням квадрат 256 px; для транспорту 640×360) у WebP
   і в публічне сховище «catalog»; обрізається по центру; повертає адресу */
export async function uploadCatalogImage(file, path, frame = { w: 256, h: 256 }) {
    if (!supabase)
        throw new Error('немає бази');
    if (!file.type.startsWith('image/'))
        throw new Error('Це не картинка');
    const bmp = await decode(file);
    const ratio = frame.w / frame.h;
    const sw = Math.min(bmp.width, bmp.height * ratio), sh = sw / ratio;
    const k = Math.min(1, frame.w / sw);
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k);
    c.height = Math.round(sh * k);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    const blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('не вдалося стиснути'))), 'image/webp', 0.85));
    /* Safari не вміє кодувати WebP і віддає PNG — тоді й тип ставимо справжній */
    const { error } = await supabase.storage.from('catalog').upload(path, blob, { upsert: true, contentType: blob.type || 'image/png', cacheControl: '3600' });
    if (error)
        throw error;
    const { data } = supabase.storage.from('catalog').getPublicUrl(path);
    return data.publicUrl + '?v=' + Date.now(); // нова версія одразу, без старого кешу
}
