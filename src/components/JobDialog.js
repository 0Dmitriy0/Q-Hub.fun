import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { FORUM_FAQ } from '../data/jobs';
import Icon from './Icon';
import Profit from './Profit';
/* вікно роботи: показує лише заповнені розділи; опис, заробіток і поради з'являться, коли їх допишемо */
const SECTIONS = [
    ['requirements', 'Вимоги'], ['location', 'Де влаштуватися'], ['features', 'Особливості'],
    ['skills', 'Рівні навички'], ['progress', 'Прокачка навички'], ['controls', 'Керування'], ['tips', 'Поради']
];
export default function JobDialog({ job, onClose }) {
    const dlg = useRef(null);
    useEffect(() => { if (job)
        dlg.current?.showModal();
    else
        dlg.current?.close(); }, [job?.id]);
    if (!job)
        return _jsx("dialog", { ref: dlg, className: "modal jmodal", onClose: onClose });
    const list = (k) => job[k] || [];
    return (_jsx("dialog", { ref: dlg, className: "modal jmodal", "aria-labelledby": "jd-title", onClose: onClose, onClick: e => { if (e.target === dlg.current)
            onClose(); }, children: _jsxs("div", { className: "modal-box", children: [_jsxs("div", { className: "row between", children: [_jsxs("div", { className: "jd-head", children: [_jsx("img", { className: "jd-ico", src: `/icons/jobs/${job.id}.svg`, alt: "", width: 72, height: 72 }), _jsxs("div", { children: [_jsx("h2", { id: "jd-title", children: job.name }), _jsxs("div", { className: "jd-tags", children: [_jsx("span", { className: 'jtag' + (job.legal ? '' : ' ill'), children: job.legal ? 'Легальна' : 'Нелегальна' }), _jsxs("span", { className: "jtag lvl", children: [_jsx(Icon, { name: "trophy", size: 13 }), "\u0437 ", job.level, " \u0440\u0456\u0432\u043D\u044F"] }), _jsx(Profit, { n: job.profit })] })] })] }), _jsx("button", { type: "button", className: "btn sm ghost", onClick: onClose, "aria-label": "\u0417\u0430\u043A\u0440\u0438\u0442\u0438", children: "\u2715" })] }), _jsxs("section", { className: "jd-sec", children: [_jsx("h3", { children: "\u041E\u043F\u0438\u0441" }), job.description ? _jsx("p", { className: "jd-text", children: job.description }) : _jsx("p", { className: "muted", children: "\u041E\u043F\u0438\u0441 \u0449\u0435 \u0434\u043E\u0434\u0430\u0454\u043C\u043E." })] }), job.pay && _jsxs("section", { className: "jd-sec", children: [_jsx("h3", { children: "\u0417\u0430\u0440\u043E\u0431\u0456\u0442\u043E\u043A" }), _jsx("p", { className: "jd-text", children: job.pay })] }), _jsx("div", { className: "jd-cols", children: SECTIONS.filter(([k]) => list(k).length).map(([k, t]) => (_jsxs("section", { className: "jd-sec", children: [_jsx("h3", { children: t }), _jsx("ul", { children: list(k).map((x, i) => _jsx("li", { children: x }, i)) })] }, k))) }), job.forum && _jsxs("p", { className: "muted jd-src", children: ["\u0414\u0436\u0435\u0440\u0435\u043B\u043E: ", _jsx("a", { href: FORUM_FAQ, target: "_blank", rel: "noopener noreferrer", children: "F.A.Q. \u00AB\u0420\u043E\u0431\u043E\u0442\u0438 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0456\u00BB \u043D\u0430 \u0444\u043E\u0440\u0443\u043C\u0456 QuantRP" })] })] }) }));
}
