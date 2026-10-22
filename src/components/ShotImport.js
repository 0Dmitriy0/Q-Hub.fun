import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { money, parseMoney } from '../lib/format';
import { detectBuyer, parseShot } from '../lib/shotParse';
import Icon from './Icon';
import Select from './Select';
/* Tesseract вантажиться лише коли гравець уперше вставляє скрін (≈17 МБ, з нашого ж сайту), і живе до закриття сторінки */
let workerP = null;
async function ocrWorker(onProgress) {
    if (!workerP)
        workerP = import('tesseract.js').then(T => T.createWorker(['ukr', 'eng'], 1, {
            workerPath: '/ocr/worker.min.js', corePath: '/ocr/', langPath: '/ocr', gzip: false,
            logger: m => { if (m.status === 'loading language traineddata' || m.status === 'loading tesseract core')
                onProgress('Готую розпізнавання… ' + Math.round((m.progress || 0) * 100) + '%'); }
        }));
    return workerP;
}
/* лишаємо тільки білий текст (назви й ціни білі, опис сірий, фото кольорові) і ділимо на дві колонки карток */
async function prepare(file) {
    const bmp = await createImageBitmap(file);
    const src = document.createElement('canvas');
    src.width = bmp.width;
    src.height = bmp.height;
    const sx = src.getContext('2d', { willReadFrequently: true });
    sx.drawImage(bmp, 0, 0);
    const img = sx.getImageData(0, 0, src.width, src.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const v = mn > 185 && mx - mn < 40 ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
    }
    sx.putImageData(img, 0, 0);
    const cols = src.width >= 700 ? 2 : 1, w = Math.floor(src.width / cols), k = Math.min(2, 2400 / w);
    return Array.from({ length: cols }, (_, c) => {
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * k);
        cv.height = Math.round(src.height * k);
        const x = cv.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(src, c * w, 0, w, src.height, 0, 0, cv.width, cv.height);
        return cv;
    });
}
export default function ShotImport({ catalog, buyerName, onBuyer, onDone }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState('');
    const [buyer, setBuyer] = useState('');
    const [rows, setRows] = useState([]);
    const [msg, setMsg] = useState('');
    const box = useRef(null);
    async function handle(file) {
        setMsg('');
        setRows([]);
        try {
            setBusy('Готую розпізнавання…');
            const w = await ocrWorker(setBusy);
            const parts = await prepare(file), lines = [];
            for (let c = 0; c < parts.length; c++) {
                setBusy(`Читаю скрін… ${c + 1} з ${parts.length}`);
                const { data } = await w.recognize(parts[c], {}, { blocks: true });
                for (const b of data.blocks || [])
                    for (const p of b.paragraphs)
                        for (const l of p.lines)
                            lines.push({ text: l.text, y: l.bbox.y0, col: c });
            }
            const b = detectBuyer(lines, catalog);
            if (!b) {
                setBusy('');
                setMsg('Не вдалося впізнати товари на скріні. Зроби скрін меню скупника цілком, без обрізання, і спробуй ще раз.');
                return;
            }
            const mine = catalog.filter(i => i.buyer_id === b);
            setBuyer(b);
            onBuyer(b);
            setRows(parseShot(lines, mine).map((r, i) => ({ key: String(i), item_id: r.item?.id ?? '', price: r.price ? String(r.price) : '', read: r.read, on: !!(r.item && r.price) })));
            setBusy('');
        }
        catch (e) {
            setBusy('');
            setMsg('Не вдалося прочитати скрін: ' + (e instanceof Error ? e.message : String(e)));
        }
    }
    /* Ctrl+V зі скріном, поки панель відкрита */
    useEffect(() => {
        if (!open)
            return;
        const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) {
            e.preventDefault();
            handle(f);
        } };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    });
    const items = catalog.filter(i => i.buyer_id === buyer);
    const set = (k, p) => setRows(rs => rs.map(r => (r.key === k ? { ...r, ...p, status: undefined } : r)));
    const chosen = rows.filter(r => r.on && r.item_id && parseMoney(r.price) > 0);
    async function submit() {
        setBusy('Вношу ціни…');
        let ok = 0;
        for (const r of chosen) {
            const { error } = await supabase.from('price_reports').insert({ kind: 'buyer', buyer_id: buyer, item_id: r.item_id, price: parseMoney(r.price) });
            const st = error ? (/^(Ціна|Ця ціна|Спершу|Забагато|У цього)/.test(error.message) ? error.message : 'не вдалося зберегти') : 'ok';
            if (!error)
                ok++;
            setRows(rs => rs.map(x => (x.key === r.key ? { ...x, status: st, on: !!error } : x)));
        }
        setBusy('');
        setMsg(`Внесено ${ok} з ${chosen.length}.` + (ok < chosen.length ? ' Решту дивись у таблиці.' : ''));
        if (ok)
            onDone();
    }
    if (!open)
        return _jsxs("button", { type: "button", className: "btn sm", onClick: () => setOpen(true), children: [_jsx(Icon, { name: "camera" }), "\u0412\u043D\u0435\u0441\u0442\u0438 \u0441\u043A\u0440\u0456\u043D\u0448\u043E\u0442\u043E\u043C"] });
    return (_jsxs("section", { className: "card shot", ref: box, "aria-label": "\u0412\u043D\u0435\u0441\u0435\u043D\u043D\u044F \u0446\u0456\u043D \u0441\u043A\u0440\u0456\u043D\u0448\u043E\u0442\u043E\u043C", children: [_jsxs("div", { className: "row between", children: [_jsxs("h2", { className: "ih", children: [_jsx(Icon, { name: "camera" }), "\u0426\u0456\u043D\u0438 \u0437\u0456 \u0441\u043A\u0440\u0456\u043D\u0448\u043E\u0442\u0430"] }), _jsx("button", { type: "button", className: "btn sm ghost", onClick: () => { setOpen(false); setRows([]); setMsg(''); }, children: "\u0417\u0430\u043A\u0440\u0438\u0442\u0438" })] }), _jsxs("label", { className: "drop", onDragOver: e => e.preventDefault(), onDrop: e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f)
                    handle(f); }, children: [_jsx("input", { type: "file", accept: "image/*", className: "vh", onChange: e => { const f = e.target.files?.[0]; e.target.value = ''; if (f)
                            handle(f); } }), _jsx(Icon, { name: "camera", size: 22 }), _jsxs("span", { children: [_jsx("b", { children: "\u0412\u0441\u0442\u0430\u0432 \u0441\u043A\u0440\u0456\u043D (Ctrl+V)" }), ", \u043F\u0435\u0440\u0435\u0442\u044F\u0433\u043D\u0438 \u0439\u043E\u0433\u043E \u0441\u044E\u0434\u0438 \u0430\u0431\u043E \u043D\u0430\u0442\u0438\u0441\u043D\u0438, \u0449\u043E\u0431 \u0432\u0438\u0431\u0440\u0430\u0442\u0438 \u0444\u0430\u0439\u043B."] }), _jsx("small", { className: "muted", children: "\u0421\u043A\u0440\u0456\u043D \u043C\u0435\u043D\u044E \u0441\u043A\u0443\u043F\u043D\u0438\u043A\u0430 \u0446\u0456\u043B\u043A\u043E\u043C. \u0420\u043E\u0437\u043F\u0456\u0437\u043D\u0430\u0432\u0430\u043D\u043D\u044F \u0439\u0434\u0435 \u0443 \u0442\u0432\u043E\u0454\u043C\u0443 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0456 \u2014 \u0441\u043A\u0440\u0456\u043D \u043D\u0456\u043A\u0443\u0434\u0438 \u043D\u0435 \u043D\u0430\u0434\u0441\u0438\u043B\u0430\u0454\u0442\u044C\u0441\u044F." })] }), busy && _jsx("p", { className: "muted", role: "status", children: busy }), msg && _jsx("p", { className: rows.length ? 'muted' : 'err', role: "status", children: msg }), rows.length > 0 && _jsxs(_Fragment, { children: [_jsxs("p", { className: "muted note", children: ["\u0421\u043A\u0443\u043F\u043D\u0438\u043A: ", _jsx("b", { children: buyerName(buyer) }), ". \u041F\u0435\u0440\u0435\u0432\u0456\u0440 \u0446\u0456\u043D\u0438 \u2014 \u043F\u043E\u043C\u0438\u043B\u043A\u0438 \u0440\u043E\u0437\u043F\u0456\u0437\u043D\u0430\u0432\u0430\u043D\u043D\u044F \u0442\u0440\u0430\u043F\u043B\u044F\u044E\u0442\u044C\u0441\u044F. \u041D\u0435\u0432\u043F\u0456\u0437\u043D\u0430\u043D\u0435 \u043F\u0456\u0434\u0441\u0432\u0456\u0447\u0435\u043D\u043E, \u0439\u043E\u0433\u043E \u043C\u043E\u0436\u043D\u0430 \u0432\u0438\u0431\u0440\u0430\u0442\u0438 \u0432\u0440\u0443\u0447\u043D\u0443."] }), _jsx("div", { className: "scroll", children: _jsxs("table", { className: "t shot-t", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "\u0422\u043E\u0432\u0430\u0440" }), _jsx("th", { className: "n", children: "\u0426\u0456\u043D\u0430" }), _jsx("th", { children: "\u0421\u0442\u0430\u043D" })] }) }), _jsx("tbody", { children: rows.map(r => {
                                        const it = items.find(i => i.id === r.item_id), p = parseMoney(r.price);
                                        const out = it && p > 0 && it.min > 0 && it.max > it.min && (p < it.min * 0.9 || p > it.max * 1.1);
                                        const same = it && p === it.price;
                                        return _jsxs("tr", { className: !r.item_id ? 'bad' : out ? 'warn' : '', children: [_jsx("td", { children: _jsx("input", { type: "checkbox", "aria-label": "\u0412\u043D\u043E\u0441\u0438\u0442\u0438 \u0446\u0435\u0439 \u0440\u044F\u0434\u043E\u043A", checked: r.on, onChange: e => set(r.key, { on: e.target.checked }) }) }), _jsx("td", { className: "shot-item", children: _jsx(Select, { className: "sm", label: "\u0422\u043E\u0432\u0430\u0440", placeholder: "\u2014 \u0432\u0438\u0431\u0435\u0440\u0438 \u0442\u043E\u0432\u0430\u0440 \u2014", value: r.item_id, onChange: v => set(r.key, { item_id: v, on: true }), options: items.map(i => ({ value: i.id, label: i.name })) }) }), _jsx("td", { className: "n", children: _jsx("input", { "aria-label": "\u0426\u0456\u043D\u0430", inputMode: "numeric", value: r.price, onChange: e => set(r.key, { price: e.target.value }) }) }), _jsx("td", { children: _jsx("small", { children: r.status === 'ok' ? '✓ внесено' : r.status ? r.status : !r.item_id ? 'товар не впізнано' : !p ? 'немає ціни' : out ? `поза межами ${money(it.min)}–${money(it.max)}` : same ? 'така ж, як зараз' : 'готово' }) })] }, r.key);
                                    }) })] }) }), _jsx("div", { className: "row", children: _jsxs("button", { type: "button", className: "btn acc", disabled: !chosen.length || !!busy, onClick: submit, children: ["\u0412\u043D\u0435\u0441\u0442\u0438 ", chosen.length, " ", chosen.length === 1 ? 'ціну' : chosen.length >= 2 && chosen.length <= 4 ? 'ціни' : 'цін'] }) })] })] }));
}
