import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
/* нік персонажа і статік обов'язкові: поки їх немає, після входу висить це вікно — закрити його можна
   лише зберігши дані або вийшовши з акаунта. Ту саму форму показує кабінет, щоб їх можна було змінити */
const NICK = /^[\p{L}\d _.-]{3,32}$/u;
export function StaticForm({ onDone, submitLabel = 'Зберегти' }) {
    const { staticId, gameName, saveProfile } = useAuth();
    const [nick, setNick] = useState(gameName);
    const [v, setV] = useState(staticId ? String(staticId) : '');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    return (_jsxs("form", { className: "static-form", onSubmit: async (e) => {
            e.preventDefault();
            const g = nick.trim(), n = Number(v.replace(/\D/g, ''));
            if (!NICK.test(g)) {
                setErr('Нік персонажа — як у грі, від 3 до 32 символів, наприклад Ivan_Petrov.');
                return;
            }
            if (!(n >= 1 && n <= 999999999)) {
                setErr('Статік — це число з гри, наприклад 12345.');
                return;
            }
            setBusy(true);
            const m = await saveProfile(g, n);
            setBusy(false);
            if (m)
                setErr(m);
            else {
                setErr('');
                onDone?.();
            }
        }, children: [_jsxs("label", { className: "fld", children: [_jsx("span", { children: "\u041D\u0456\u043A \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0432 \u0433\u0440\u0456" }), _jsx("input", { autoComplete: "off", placeholder: "\u043D\u0430\u043F\u0440\u0438\u043A\u043B\u0430\u0434 Ivan_Petrov", value: nick, onChange: e => { setNick(e.target.value); setErr(''); }, required: true })] }), _jsxs("label", { className: "fld", children: [_jsx("span", { children: "\u0421\u0442\u0430\u0442\u0456\u043A (ID \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430)" }), _jsx("input", { inputMode: "numeric", autoComplete: "off", placeholder: "\u043D\u0430\u043F\u0440\u0438\u043A\u043B\u0430\u0434 12345", value: v, onChange: e => { setV(e.target.value); setErr(''); }, required: true })] }), err && _jsx("small", { className: "err", role: "alert", children: err }), _jsx("button", { className: "btn acc", disabled: busy, children: busy ? 'Зберігаю…' : submitLabel })] }));
}
export default function StaticGate() {
    const { session, staticId, signOut } = useAuth();
    const dlg = useRef(null);
    const need = !!session && staticId === null;
    useEffect(() => { if (need)
        dlg.current?.showModal();
    else
        dlg.current?.close(); }, [need]);
    return (_jsx("dialog", { ref: dlg, className: "modal", "aria-labelledby": "static-title", onCancel: e => e.preventDefault(), children: _jsxs("div", { className: "modal-box", children: [_jsx("h2", { id: "static-title", children: "\u0412\u043A\u0430\u0436\u0438 \u043D\u0456\u043A \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0456 \u0441\u0442\u0430\u0442\u0456\u043A" }), _jsx("p", { className: "muted note", children: "\u0411\u0435\u0437 \u043D\u0438\u0445 \u043D\u0435 \u043C\u043E\u0436\u043D\u0430 \u043E\u043D\u043E\u0432\u043B\u044E\u0432\u0430\u0442\u0438 \u0446\u0456\u043D\u0438. \u0411\u0456\u043B\u044F \u043A\u043E\u0436\u043D\u043E\u0457 \u0437\u043C\u0456\u043D\u0438 \u0446\u0456\u043D\u0438 \u0432\u0441\u0456 \u0431\u0430\u0447\u0430\u0442\u044C \u043D\u0456\u043A \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430 \u0456 \u0441\u0442\u0430\u0442\u0456\u043A \u0442\u043E\u0433\u043E, \u0445\u0442\u043E \u0457\u0457 \u0432\u043D\u0456\u0441." }), _jsx(StaticForm, {}), _jsx("button", { type: "button", className: "btn ghost sm", onClick: signOut, children: "\u0412\u0438\u0439\u0442\u0438 \u0437 \u0430\u043A\u0430\u0443\u043D\u0442\u0430" })] }) }));
}
