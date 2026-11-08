import { MAP_ICONS } from '../data/mapIcons';

/* сітка готових іконок мапи; null — «як у категорії». extra — ще іконки (напр. свої іконки категорій з бази) */
export default function IconGrid({ value, onChange, catIcon, label, extra = [] }: {
  value: string | null; onChange: (v: string | null) => void; catIcon?: string; label: string; extra?: string[];
}) {
  const icons = [...MAP_ICONS, ...extra.filter(s => !MAP_ICONS.includes(s))];
  return (
    <div className="micons" role="radiogroup" aria-label={label}>
      {catIcon !== undefined && <button type="button" role="radio" aria-checked={value === null} className={'mcat-ico' + (value === null ? ' on' : '')} onClick={() => onChange(null)} title="Як у категорії">
        {catIcon ? <img src={catIcon} alt="" width={22} height={22} /> : null}<small>кат.</small></button>}
      {icons.map(src => (
        <button type="button" key={src} role="radio" aria-checked={value === src} className={value === src ? 'on' : ''} onClick={() => onChange(src)}><img src={src} alt="" width={26} height={26} loading="lazy" /></button>
      ))}
    </div>
  );
}
