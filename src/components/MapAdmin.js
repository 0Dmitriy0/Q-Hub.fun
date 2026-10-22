import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseBulk, slugify } from '../lib/mapData';
import { MAP_ICONS } from '../data/mapIcons';
import { fromQuantFun } from '../lib/mapGeo';
import Select from './Select';
import PicUpload from './PicUpload';
const dbErr = (m) => /owner_static|column .* does not exist/i.test(m)
    ? 'У базі стара версія таблиць мапи. Запусти оновлений q-hub-map.sql у Supabase → SQL Editor ще раз.'
    : /relation .*map_(points|categories)|schema cache/i.test(m)
        ? 'У базі ще немає таблиць мапи. Запусти q-hub-map.sql у Supabase → SQL Editor.'
        : /row-level security|permission/i.test(m) ? 'Це може лише адмін.' : m;
/* інструменти адміна на мапі: нова мітка (координати вписати або взяти кліком), багато міток рядками, нова категорія */
export default function MapAdmin({ cats, picked, picking, onPick, onMarks, onCat }) {
    const own = cats.filter(c => !c.builtin);
    const [cat, setCat] = useState(own[0]?.id || '');
    /* категорії з бази приходять уже після відкриття форми — тоді вибираємо першу */
    useEffect(() => { if (!cat && own.length)
        setCat(own[0].id); }, [own.length]); // eslint-disable-line react-hooks/exhaustive-deps
    const [name, setName] = useState('');
    const [note, setNote] = useState('');
    const [owner, setOwner] = useState('');
    const [x, setX] = useState('');
    const [y, setY] = useState('');
    const [bulk, setBulk] = useState('');
    /* звідки координати: з гри (як у нас) чи пікселі з мапи QuantFun — тоді переводимо самі */
    const [src, setSrc] = useState('game');
    const conv = src === 'qf' ? fromQuantFun : undefined;
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [cName, setCName] = useState('');
    const [cGrp, setCGrp] = useState('Міні-ігри, квести й контракти');
    const [cColor, setCColor] = useState('#ff6a1f');
    const [cIcon, setCIcon] = useState(MAP_ICONS[0]);
    const groups = [...new Set(cats.map(c => c.grp))];
    /* координати, взяті кліком по мапі, підставляються у форму */
    const [seen, setSeen] = useState(null);
    if (picked && picked !== seen) {
        setSeen(picked);
        setX(String(Math.round(picked[0] * 10) / 10));
        setY(String(Math.round(picked[1] * 10) / 10));
    }
    const toMark = (r) => ({ id: 'db-' + r.id, dbId: r.id, category: r.category_id, name: r.name, note: r.note, x: r.x, y: r.y, owner: r.owner_static });
    async function insert(rows) {
        setBusy(true);
        setMsg('');
        const { data, error } = await supabase.from('map_points').insert(rows).select('id,category_id,name,note,x,y,owner_static');
        setBusy(false);
        if (error) {
            setMsg(dbErr(error.message));
            return false;
        }
        onMarks((data || []).map(toMark));
        setMsg(`Додано міток: ${data?.length || 0}`);
        return true;
    }
    async function addOne() {
        const x0 = parseFloat(x.replace(',', '.')), y0 = parseFloat(y.replace(',', '.'));
        if (!cat)
            return setMsg('Вибери категорію.');
        if (!Number.isFinite(x0) || !Number.isFinite(y0))
            return setMsg('Впиши X і Y або візьми їх кліком по мапі.');
        const [xv, yv] = conv ? conv(x0, y0) : [x0, y0];
        if (xv < -6000 || xv > 6800 || yv < -4400 || yv > 8500)
            return setMsg(`Точка X ${xv}, Y ${yv} поза мапою — перевір, чи правильно вибрано «${src === 'qf' ? 'QuantFun' : 'З гри'}».`);
        const st = owner.trim() ? Number(owner.trim().replace('#', '')) : null;
        if (st !== null && !(Number.isInteger(st) && st > 0))
            return setMsg('Статік власника — ціле число, напр. 12345.');
        if (await insert([{ category_id: cat, name: name.trim(), note: note.trim(), x: xv, y: yv, owner_static: st }])) {
            setName('');
            setNote('');
            setOwner('');
            if (conv) {
                setX('');
                setY('');
            }
        }
    }
    async function addBulk() {
        if (!cat)
            return setMsg('Вибери категорію.');
        const r = parseBulk(bulk, conv);
        if (r.bad.length)
            return setMsg(`Не зрозумів рядки: ${r.bad.join(', ')}. Формат: X, Y, назва (назву можна не писати).`);
        if (!r.ok.length)
            return setMsg('Немає жодного рядка з координатами.');
        if (await insert(r.ok.map(p => ({ category_id: cat, name: p.name, note: '', x: p.x, y: p.y }))))
            setBulk('');
    }
    async function addCat() {
        const n = cName.trim();
        if (!n)
            return setMsg('Впиши назву категорії.');
        let id = slugify(n);
        if (cats.some(c => c.id === id))
            id = id.slice(0, 34) + '-' + Date.now().toString(36).slice(-5);
        const row = { id, name: n, grp: cGrp.trim() || 'Інше', icon: cIcon, color: cColor, sort: 200 + cats.length, shown: true };
        setBusy(true);
        setMsg('');
        const { error } = await supabase.from('map_categories').insert(row);
        setBusy(false);
        if (error)
            return setMsg(dbErr(error.message));
        onCat(row);
        setCat(id);
        setCName('');
        setMsg(`Категорію «${n}» створено — додай у неї мітки.`);
    }
    return (_jsxs("details", { className: "madmin", open: true, children: [_jsx("summary", { children: "\u0406\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u0438 \u0430\u0434\u043C\u0456\u043D\u0430" }), _jsxs("section", { children: [_jsx("h4", { children: "\u041D\u043E\u0432\u0430 \u043C\u0456\u0442\u043A\u0430" }), _jsx(Select, { label: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F", value: cat, onChange: setCat, searchable: true, options: own.map(c => ({ value: c.id, label: c.name, hint: c.grp })), placeholder: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F" }), _jsx("input", { className: "min", placeholder: "\u041D\u0430\u0437\u0432\u0430 (\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E)", value: name, onChange: e => setName(e.target.value), "aria-label": "\u041D\u0430\u0437\u0432\u0430 \u043C\u0456\u0442\u043A\u0438" }), _jsx("input", { className: "min", placeholder: "\u041F\u0440\u0438\u043C\u0456\u0442\u043A\u0430 (\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E)", value: note, onChange: e => setNote(e.target.value), "aria-label": "\u041F\u0440\u0438\u043C\u0456\u0442\u043A\u0430" }), _jsx("input", { className: "min mono", inputMode: "numeric", placeholder: "\u0421\u0442\u0430\u0442\u0456\u043A \u0432\u043B\u0430\u0441\u043D\u0438\u043A\u0430 \u0431\u0456\u0437\u043D\u0435\u0441\u0443 (\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E)", value: owner, onChange: e => setOwner(e.target.value), "aria-label": "\u0421\u0442\u0430\u0442\u0456\u043A \u0432\u043B\u0430\u0441\u043D\u0438\u043A\u0430" }), _jsxs("div", { className: "mseg", role: "radiogroup", "aria-label": "\u0417\u0432\u0456\u0434\u043A\u0438 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0438", children: [_jsx("button", { type: "button", role: "radio", "aria-checked": src === 'game', onClick: () => setSrc('game'), children: "\u0417 \u0433\u0440\u0438 / Q-Hub" }), _jsx("button", { type: "button", role: "radio", "aria-checked": src === 'qf', onClick: () => setSrc('qf'), children: "\u041F\u0456\u043A\u0441\u0435\u043B\u0456 QuantFun" })] }), src === 'qf' && _jsx("p", { className: "muted", children: "\u0412\u043F\u0438\u0448\u0438 \u0447\u0438\u0441\u043B\u0430 \u0437 \u043C\u0430\u043F\u0438 QuantFun \u044F\u043A \u0454 \u2014 \u043F\u0435\u0440\u0435\u0432\u0435\u0434\u0443 \u0432 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0438 \u0433\u0440\u0438 \u0441\u0430\u043C (\u043F\u043E\u0445\u0438\u0431\u043A\u0430 ~3 \u043C). \u0414\u043B\u044F \u00AB\u0412\u0437\u044F\u0442\u0438 \u0437 \u043C\u0430\u043F\u0438\u00BB \u043F\u0435\u0440\u0435\u043C\u043A\u043D\u0438 \u043D\u0430\u0437\u0430\u0434 \u043D\u0430 \u00AB\u0417 \u0433\u0440\u0438\u00BB." }), _jsxs("div", { className: "mrow", children: [_jsx("input", { className: "min mono", inputMode: "decimal", placeholder: "X", value: x, onChange: e => setX(e.target.value), "aria-label": "X" }), _jsx("input", { className: "min mono", inputMode: "decimal", placeholder: "Y", value: y, onChange: e => setY(e.target.value), "aria-label": "Y" })] }), _jsxs("div", { className: "mrow", children: [_jsx("button", { type: "button", className: 'btn sm' + (picking ? ' acc' : ' ghost'), onClick: () => { setSrc('game'); onPick(!picking); }, "aria-pressed": picking, children: picking ? 'Клікни на мапі…' : 'Взяти з мапи' }), _jsx("button", { type: "button", className: "btn sm acc", disabled: busy, onClick: addOne, children: "\u0414\u043E\u0434\u0430\u0442\u0438 \u043C\u0456\u0442\u043A\u0443" })] })] }), _jsxs("section", { children: [_jsx("h4", { children: "\u0411\u0430\u0433\u0430\u0442\u043E \u043C\u0456\u0442\u043E\u043A \u043E\u0434\u0440\u0430\u0437\u0443" }), _jsxs("p", { className: "muted", children: ["\u0423 \u0432\u0438\u0431\u0440\u0430\u043D\u0443 \u0432\u0438\u0449\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044E", src === 'qf' ? ', пікселі QuantFun' : '', ". \u041A\u043E\u0436\u0435\u043D \u0440\u044F\u0434\u043E\u043A: ", _jsx("span", { className: "mono", children: "X, Y, \u043D\u0430\u0437\u0432\u0430" })] }), _jsx("textarea", { className: "min mono", rows: 4, placeholder: '-1600, -1000, Бак біля пірсу\n120.5, -830', value: bulk, onChange: e => setBulk(e.target.value), "aria-label": "\u041C\u0456\u0442\u043A\u0438 \u0440\u044F\u0434\u043A\u0430\u043C\u0438" }), _jsxs("button", { type: "button", className: "btn sm acc", disabled: busy || !bulk.trim(), onClick: addBulk, children: ["\u0414\u043E\u0434\u0430\u0442\u0438 ", parseBulk(bulk, conv).ok.length || '', " \u043C\u0456\u0442\u043E\u043A"] })] }), _jsxs("section", { children: [_jsx("h4", { children: "\u041D\u043E\u0432\u0430 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F" }), _jsx("input", { className: "min", placeholder: "\u041D\u0430\u0437\u0432\u0430, \u043D\u0430\u043F\u0440. \u0421\u043C\u0456\u0442\u0442\u0454\u0432\u0456 \u0431\u0430\u043A\u0438", value: cName, onChange: e => setCName(e.target.value), "aria-label": "\u041D\u0430\u0437\u0432\u0430 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0457" }), _jsx("input", { className: "min", list: "map-groups", placeholder: "\u0413\u0440\u0443\u043F\u0430", value: cGrp, onChange: e => setCGrp(e.target.value), "aria-label": "\u0413\u0440\u0443\u043F\u0430" }), _jsx("datalist", { id: "map-groups", children: groups.map(g => _jsx("option", { value: g }, g)) }), _jsxs("label", { className: "mrow mcolor", children: ["\u041A\u043E\u043B\u0456\u0440 \u043E\u0431\u0432\u043E\u0434\u043A\u0438 ", _jsx("input", { type: "color", value: cColor, onChange: e => setCColor(e.target.value) })] }), _jsx("div", { className: "micons", role: "radiogroup", "aria-label": "\u0406\u043A\u043E\u043D\u043A\u0430", children: MAP_ICONS.map(src => (_jsx("button", { type: "button", role: "radio", "aria-checked": cIcon === src, className: cIcon === src ? 'on' : '', onClick: () => setCIcon(src), children: _jsx("img", { src: src, alt: "", width: 26, height: 26, loading: "lazy" }) }, src))) }), _jsxs("div", { className: "mrow", children: [_jsx("span", { className: "muted", children: "\u0430\u0431\u043E \u0441\u0432\u043E\u044F:" }), _jsx(PicUpload, { label: "\u0421\u0432\u043E\u044F \u0456\u043A\u043E\u043D\u043A\u0430 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0457", path: `map/${slugify(cName || 'icon')}-${Date.now().toString(36)}.webp`, frame: { w: 128, h: 128 }, onDone: async (url) => { setCIcon(url); } }), !MAP_ICONS.includes(cIcon) && _jsx("img", { src: cIcon, alt: "\u0421\u0432\u043E\u044F \u0456\u043A\u043E\u043D\u043A\u0430", width: 26, height: 26 })] }), _jsx("button", { type: "button", className: "btn sm acc", disabled: busy, onClick: addCat, children: "\u0421\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044E" })] }), msg && _jsx("p", { className: "mmsg", role: "status", children: msg })] }));
}
