import { jsx as _jsx } from "react/jsx-runtime";
/* Лінійні іконки одного стилю (24×24, обвідка 2px, колір — від тексту поруч). Без зовнішніх бібліотек. */
const P = {
    home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
    buyer: 'M4 7h16l-1.5 9.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5L4 7zM9 7V5a3 3 0 0 1 6 0v2M9 12h6',
    car: 'M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16M4 16h16v3H4zM7 19v1.5M17 19v1.5M7.5 13.5h.01M16.5 13.5h.01',
    moto: 'M5 17a3 3 0 1 0 0-.01M19 17a3 3 0 1 0 0-.01M8 17h5l3-6h-4l-2-3H7M14 7h3l2 4',
    plane: 'M2 13l8 1.5L13 21h2l-1-6.5 5-1a2 2 0 0 0 0-3l-5-1L15 3h-2l-3 6.5L2 11z',
    jobs: 'M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 13h16',
    map: 'M9 4l6 2 5-2v16l-5 2-6-2-5 2V6zM9 4v16M15 6v16',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z',
    trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6v3H9z',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
    speed: 'M4 15a8 8 0 1 1 16 0M12 15l4-5M8 19h8',
    box: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
    fuel: 'M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M5 10h9M14 8l3 2v7a1.5 1.5 0 0 0 3 0V9l-3-3',
    tag: 'M3 12V4h8l9 9-8 8zM7.5 7.5h.01',
    bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5H14.5',
    shield: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z'
};
export default function Icon({ name, size = 18, className = '' }) {
    return (_jsx("svg", { className: 'ico ' + className, width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false", children: _jsx("path", { d: P[name] || '' }) }));
}
