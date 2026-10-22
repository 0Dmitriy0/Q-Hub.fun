import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { parseHubBackup } from '../../lib/importHub';
import { money } from '../../lib/format';
import Select from '../../components/Select';
/* Імпорт копії Quant Hub. Порядок: персонаж → облік → угоди (з посиланням на транзакції й чеки) → гараж, документи, сесії.
   upsert з ignoreDuplicates за (character_id, external_id): повторний імпорт того самого файлу нічого не дублює. */
export default function ImportPage() {
    const { characters, reloadCharacters, setCurrent } = useAuth();
    const [data, setData] = useState(null);
    const [raw, setRaw] = useState(null);
    const [name, setName] = useState('');
    const [target, setTarget] = useState('new');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState('');
    async function onFile(f) {
        setMsg('');
        setDone('');
        setData(null);
        if (!f)
            return;
        try {
            const j = JSON.parse(await f.text());
            setRaw(j);
            setData(parseHubBackup(j, name || 'Персонаж'));
        }
        catch (e) {
            setMsg(e instanceof Error && e.message.includes('Quant Hub') ? e.message + '. Збережи копію кнопкою «Зберегти копію» в хабі.' : 'Не вдалося прочитати файл.');
        }
    }
    async function run() {
        if (!data || !supabase)
            return;
        setBusy(true);
        setMsg('');
        const sb = supabase;
        try {
            const d = parseHubBackup(raw, name || 'Персонаж');
            let cid = target;
            if (target === 'new') {
                const { data: ch, error } = await sb.from('characters').insert(d.character).select('id').single();
                if (error)
                    throw error;
                cid = ch.id;
            }
            const up = async (table, rows) => {
                for (let i = 0; i < rows.length; i += 500) {
                    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500).map(r => ({ ...r, character_id: cid })), { onConflict: 'character_id,external_id', ignoreDuplicates: true });
                    if (error)
                        throw error;
                }
            };
            await up('transactions', d.transactions);
            const { data: txs } = await sb.from('transactions').select('id,external_id').eq('character_id', cid).not('external_id', 'is', null).limit(20000);
            const txMap = new Map((txs || []).map(t => [t.external_id, t.id]));
            const receipts = new Map();
            await up('deals', d.deals.map(({ tx_external_id, receipt_key, ...x }) => ({
                ...x,
                tx_id: tx_external_id ? txMap.get(tx_external_id) ?? null : null,
                receipt_id: receipt_key ? (receipts.get(receipt_key) ?? (receipts.set(receipt_key, crypto.randomUUID()), receipts.get(receipt_key))) : null
            })));
            await up('cars', d.cars);
            await up('documents', d.documents);
            await up('game_sessions', d.sessions);
            await reloadCharacters();
            setCurrent(cid);
            setDone(`Перенесено: ${d.counts.transactions} записів обліку, ${d.counts.deals} угод, ${d.counts.cars} авто, ${d.counts.documents} документів, ${d.counts.sessions} сесій.`);
        }
        catch {
            setMsg('Імпорт зупинився з помилкою. Те, що вже перенеслось, лишилось; запусти ще раз — дублів не буде.');
        }
        setBusy(false);
    }
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "\u0406\u043C\u043F\u043E\u0440\u0442 \u0437 Quant Hub" }), _jsxs("ol", { className: "steps", children: [_jsx("li", { children: _jsxs("span", { children: ["\u0423 \u0445\u0430\u0431\u0456 \u043D\u0430 claude.ai \u043D\u0430\u0442\u0438\u0441\u043D\u0438 \u00AB\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u043A\u043E\u043F\u0456\u044E\u00BB \u2014 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0442\u044C\u0441\u044F ", _jsx("span", { className: "mono", children: "quant-hub-\u0420\u0420\u0420\u0420-\u041C\u041C-\u0414\u0414.json" }), "."] }) }), _jsx("li", { children: _jsx("span", { children: "\u041E\u0431\u0435\u0440\u0438 \u0446\u0435\u0439 \u0444\u0430\u0439\u043B \u043D\u0438\u0436\u0447\u0435 \u0456 \u043F\u0435\u0440\u0435\u0432\u0456\u0440, \u0449\u043E \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E." }) }), _jsx("li", { children: _jsx("span", { children: "\u041D\u0430\u0442\u0438\u0441\u043D\u0438 \u00AB\u041F\u0435\u0440\u0435\u043D\u0435\u0441\u0442\u0438\u00BB. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0438\u0439 \u0456\u043C\u043F\u043E\u0440\u0442 \u0442\u043E\u0433\u043E \u0441\u0430\u043C\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0443 \u043D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0434\u0443\u0431\u043B\u044E\u0454." }) })] }), _jsxs("div", { className: "form cols", children: [_jsxs("label", { className: "fld", children: ["\u041A\u0443\u0434\u0438", _jsx(Select, { value: target, onChange: setTarget, options: [{ value: 'new', label: 'Новий персонаж', icon: 'user' }, ...characters.map(c => ({ value: c.id, label: c.name, icon: 'user' }))] })] }), target === 'new' && _jsxs("label", { className: "fld", children: ["\u0406\u043C'\u044F \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430", _jsx("input", { value: name, onChange: e => setName(e.target.value), placeholder: "Dmitriy_Core", maxLength: 40 })] }), _jsxs("label", { className: "fld", children: ["\u0424\u0430\u0439\u043B \u043A\u043E\u043F\u0456\u0457", _jsx("input", { type: "file", accept: "application/json,.json", onChange: e => onFile(e.target.files?.[0]) })] })] }), data && _jsxs("div", { className: "card", style: { background: 'var(--surface2)' }, children: [_jsx("b", { children: "\u0417\u043D\u0430\u0439\u0434\u0435\u043D\u043E" }), _jsxs("span", { className: "muted", children: ["\u041E\u0431\u043B\u0456\u043A: ", data.counts.transactions, " \u00B7 \u0423\u0433\u043E\u0434\u0438: ", data.counts.deals, " \u00B7 \u0413\u0430\u0440\u0430\u0436: ", data.counts.cars, " \u00B7 \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0438: ", data.counts.documents, " \u00B7 \u0421\u0435\u0441\u0456\u0457: ", data.counts.sessions] }), target === 'new' && _jsxs("span", { className: "muted", children: ["\u0421\u0442\u0430\u0440\u0442 \u043E\u0431\u043B\u0456\u043A\u0443 ", money(data.character.start_balance), data.character.goal ? ' · ціль ' + data.character.goal_name + ' ' + money(data.character.goal) : ''] }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "btn acc", disabled: busy || (target === 'new' && !name.trim()), onClick: run, children: busy ? 'Переношу…' : 'Перенести' }), target === 'new' && !name.trim() && _jsx("span", { className: "muted", children: "\u0432\u043A\u0430\u0436\u0438 \u0456\u043C'\u044F \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430" })] })] }), msg && _jsx("p", { className: "err", children: msg }), done && _jsx("p", { className: "ok", children: done })] }));
}
