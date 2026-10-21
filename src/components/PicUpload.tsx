import { useState } from 'react';
import { uploadCatalogImage } from '../lib/images';

/* зрозуміле пояснення замість технічної помилки сховища */
function imageError(x: unknown) {
  const m = x instanceof Error ? x.message : String((x as { message?: string })?.message ?? x);
  if (/row-level security|unauthorized|403|лише адмін/i.test(m)) return 'Завантажувати картинки може лише адмін. Увійди тим акаунтом Discord, який є адміном сайту.';
  if (/bucket not found/i.test(m)) return 'У базі немає сховища для картинок. Запусти q-hub-profile.sql у Supabase → SQL Editor.';
  if (/too large|maximum allowed size/i.test(m)) return 'Картинка завелика. Обери файл до 1 МБ.';
  return 'Не вдалося завантажити картинку: ' + m;
}

/* кнопка-файл для адміна: вибрав картинку → стиснулась → у сховище → адреса в рядок каталогу */
export default function PicUpload({ label, path, onDone, frame }: { label: string; path: string; onDone: (url: string) => Promise<void>; frame?: { w: number; h: number } }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={'btn sm ghost' + (busy ? ' busy' : '')} title={label}>
      {busy ? 'Вантажу…' : 'Фото'}
      <input type="file" accept="image/*" className="vh" disabled={busy} onChange={async e => {
        const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
        setBusy(true);
        try { await onDone(await uploadCatalogImage(f, path, frame)); } catch (x) { alert(imageError(x)); }
        setBusy(false);
      }} />
    </label>
  );
}
