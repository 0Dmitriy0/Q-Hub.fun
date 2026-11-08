import Icon, { type IconName } from '../Icon';

/* вибір іконки гайду: сітка кнопок-іконок (радіогрупа) — назви іконок гравцю нічого не скажуть */
export default function IconPicker({ value, options, onChange, labelledBy }: { value: string; options: string[]; onChange: (v: string) => void; labelledBy: string }) {
  return (
    <div className="icpick" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map(o => (
        <button key={o} type="button" role="radio" aria-checked={value === o} aria-label={o} title={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>
          <Icon name={o as IconName} size={18} />
        </button>))}
    </div>
  );
}
