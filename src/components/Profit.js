import { jsx as _jsx } from "react/jsx-runtime";
import Icon from './Icon';
/* прибутковість трьома монетами; 0 — ще не оцінена */
export default function Profit({ n }) {
    return (_jsx("span", { className: "jprofit", title: n ? `Прибутковість ${n} з 3` : 'Прибутковість ще не оцінена', "aria-label": n ? `Прибутковість ${n} з 3` : 'Прибутковість не оцінена', children: [1, 2, 3].map(i => _jsx(Icon, { name: "coin", size: 15, className: i <= n ? 'on' : '' }, i)) }));
}
