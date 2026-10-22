import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { uploadCatalogImage } from '../lib/images';
/* зрозуміле пояснення замість технічної помилки сховища */
function imageError(x) {
    const m = x instanceof Error ? x.message : String(x?.message ?? x);
    if (/row-level security|unauthorized|403|лише адмін/i.test(m))
        return 'Завантажувати картинки може лише адмін. Увійди тим акаунтом Discord, який є адміном сайту.';
    if (/bucket not found/i.test(m))
        return 'У базі немає сховища для картинок. Запусти q-hub-profile.sql у Supabase → SQL Editor.';
    if (/too large|maximum allowed size/i.test(m))
        return 'Картинка завелика. Обери файл до 1 МБ.';
    return 'Не вдалося завантажити картинку: ' + m;
}
/* кнопка-файл для адміна: вибрав картинку → стиснулась → у сховище → адреса в рядок каталогу */
export default function PicUpload({ label, path, onDone, frame }) {
    const [busy, setBusy] = useState(false);
    return (_jsxs("label", { className: 'btn sm ghost' + (busy ? ' busy' : ''), title: label, children: [busy ? 'Вантажу…' : 'Фото', _jsx("input", { type: "file", accept: "image/*", className: "vh", disabled: busy, onChange: async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f)
                        return;
                    setBusy(true);
                    try {
                        await onDone(await uploadCatalogImage(f, path, frame));
                    }
                    catch (x) {
                        alert(imageError(x));
                    }
                    setBusy(false);
                } })] }));
}
