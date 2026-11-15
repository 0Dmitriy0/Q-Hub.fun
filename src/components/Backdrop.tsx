/* Фон сайту: великі м'які плями двох тонів (контурні фігури й крапкову сітку прибрано в редизайні 2026-11-15 — відволікали).
   Кольори — з токенів теми (--deco-*), тож у темній і світлій темі фон свій. Не реагує на мишу й не читається скрінрідером. */
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <svg viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="bd-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70" /></filter>
        </defs>
        <g filter="url(#bd-blur)">
          <circle cx="1180" cy="120" r="260" className="bd-a" />
          <circle cx="160" cy="620" r="230" className="bd-b" />
          <circle cx="760" cy="980" r="220" className="bd-a" opacity=".6" />
        </g>
      </svg>
    </div>
  );
}
