/* Фон сайту: великі м'які плями двох тонів, контурні геометричні фігури й крапкова сітка.
   Кольори — з токенів теми (--deco-*), тож у темній і світлій темі фон свій. Не реагує на мишу й не читається скрінрідером. */
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <svg viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="bd-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70" /></filter>
          <pattern id="bd-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" className="bd-dot" /></pattern>
          <linearGradient id="bd-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <mask id="bd-mask"><rect width="1440" height="1000" fill="url(#bd-fade)" /></mask>
        </defs>
        <g filter="url(#bd-blur)">
          <circle cx="1180" cy="120" r="260" className="bd-a" />
          <circle cx="160" cy="620" r="230" className="bd-b" />
          <circle cx="760" cy="980" r="220" className="bd-a" opacity=".6" />
        </g>
        <rect width="1440" height="560" fill="url(#bd-dots)" mask="url(#bd-mask)" />
        <g className="bd-line">
          <rect x="1040" y="420" width="150" height="150" rx="28" transform="rotate(18 1115 495)" />
          <polygon points="210,150 300,300 120,300" transform="rotate(-12 210 240)" />
          <circle cx="1290" cy="760" r="64" />
          <path d="M-20 860 C 240 780, 420 940, 700 860 S 1180 780, 1460 870" />
          <path d="M520 90 l40 0 M540 70 l0 40" />
          <path d="M880 300 l30 0 M895 285 l0 30" />
        </g>
        <g className="bd-fill">
          <rect x="60" y="80" width="54" height="54" rx="12" transform="rotate(24 87 107)" />
          <circle cx="1380" cy="330" r="10" />
          <circle cx="640" cy="640" r="6" />
          <polygon points="980,140 1004,182 956,182" />
        </g>
      </svg>
    </div>
  );
}
