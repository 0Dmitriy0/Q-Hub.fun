import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JOBS } from '../data/jobs';
import { filterJobs } from '../lib/jobs';
import Icon from '../components/Icon';
import Select from '../components/Select';
import JobDialog from '../components/JobDialog';
import Profit from '../components/Profit';
const KINDS = [['all', 'Усі'], ['legal', 'Легальні'], ['illegal', 'Нелегальні']];
const SORTS = [['name', 'За назвою', 'tag'], ['profit', 'За прибутковістю', 'coin'], ['level', 'За доступністю', 'trophy']];
export default function Jobs() {
    const [kind, setKind] = useState('all');
    const [q, setQ] = useState('');
    const [sort, setSort] = useState('name');
    /* ?job=<id> відкриває вікно роботи одразу — так веде посилання з мапи */
    const [params, setParams] = useSearchParams();
    const [openId, setOpenIdRaw] = useState(() => params.get('job') || '');
    const setOpenId = (id) => { setOpenIdRaw(id); if (!id && params.has('job')) {
        params.delete('job');
        setParams(params, { replace: true });
    } };
    const counts = useMemo(() => ({ all: JOBS.length, legal: JOBS.filter(j => j.legal).length, illegal: JOBS.filter(j => !j.legal).length }), []);
    const shown = useMemo(() => filterJobs(JOBS, kind, q, sort), [kind, q, sort]);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("h1", { children: "\u0420\u043E\u0431\u043E\u0442\u0438" }), _jsx("p", { className: "muted", children: "\u041B\u0435\u0433\u0430\u043B\u044C\u043D\u0456 \u0439 \u043D\u0435\u043B\u0435\u0433\u0430\u043B\u044C\u043D\u0456 \u0440\u043E\u0431\u043E\u0442\u0438 QuantRP: \u0437 \u044F\u043A\u043E\u0433\u043E \u0440\u0456\u0432\u043D\u044F, \u0434\u0435 \u0432\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u0442\u0438\u0441\u044F, \u044F\u043A \u043F\u0440\u043E\u043A\u0430\u0447\u0430\u0442\u0438 \u043D\u0430\u0432\u0438\u0447\u043A\u0443. \u041D\u0430\u0442\u0438\u0441\u043D\u0438 \u043D\u0430 \u0440\u043E\u0431\u043E\u0442\u0443, \u0449\u043E\u0431 \u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u043F\u043E\u0434\u0440\u043E\u0431\u0438\u0446\u0456." })] }), _jsxs("div", { className: "tbar", children: [_jsx("div", { className: "tabs", role: "tablist", "aria-label": "\u0422\u0438\u043F \u0440\u043E\u0431\u043E\u0442\u0438", children: KINDS.map(([k, label]) => (_jsxs("a", { href: '#' + k, role: "tab", "aria-selected": kind === k, className: 'tabpic' + (kind === k ? ' active' : ''), onClick: e => { e.preventDefault(); setKind(k); }, children: [_jsx(Icon, { name: k === 'illegal' ? 'shield' : 'jobs', size: 16 }), label, _jsx("span", { className: "cnt", children: counts[k] })] }, k))) }), _jsxs("div", { className: "tbar-row", children: [_jsxs("div", { className: "fld has-ico grow", children: [_jsx(Icon, { name: "search" }), _jsx("input", { type: "search", placeholder: "\u041F\u043E\u0448\u0443\u043A \u0440\u043E\u0431\u043E\u0442\u0438", value: q, onChange: e => setQ(e.target.value), "aria-label": "\u041F\u043E\u0448\u0443\u043A \u0440\u043E\u0431\u043E\u0442\u0438" })] }), _jsx("div", { className: "fld sortf", children: _jsx(Select, { label: "\u0421\u043E\u0440\u0442\u0443\u0432\u0430\u043D\u043D\u044F", value: sort, onChange: setSort, options: SORTS.map(([v, l, i]) => ({ value: v, label: l, icon: i })) }) })] })] }), !shown.length && _jsx("div", { className: "card empty", children: "\u041D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E. \u0421\u043F\u0440\u043E\u0431\u0443\u0439 \u0456\u043D\u0448\u0443 \u043D\u0430\u0437\u0432\u0443." }), _jsx("div", { className: "jgrid", children: shown.map(j => (_jsxs("button", { type: "button", className: 'card jcard' + (j.legal ? '' : ' ill'), onClick: () => setOpenId(j.id), "aria-haspopup": "dialog", children: [_jsx("img", { className: "jico", src: `/icons/jobs/${j.id}.svg`, alt: "", width: 64, height: 64, loading: "lazy" }), _jsx("span", { className: "jname", children: j.name }), _jsxs("span", { className: "jmeta", children: [_jsxs("span", { className: "jtag lvl", children: [_jsx(Icon, { name: "trophy", size: 13 }), j.level, " \u0440\u0456\u0432."] }), _jsx(Profit, { n: j.profit })] }), !j.legal && _jsx("span", { className: "jtag ill jcorner", children: "\u041D\u0435\u043B\u0435\u0433\u0430\u043B\u044C\u043D\u0430" })] }, j.id))) }), _jsx(JobDialog, { job: JOBS.find(j => j.id === openId) || null, onClose: () => setOpenId('') })] }));
}
