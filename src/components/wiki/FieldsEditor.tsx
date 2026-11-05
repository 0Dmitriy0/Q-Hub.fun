import { FIELDS, parseInput, toInput, type Data, type Section } from '../../lib/wiki';

/* поля розділу для «Прийняти з правками» (specs/043 US3 AC2): лише ті ключі, що є в пропозиції; значення — як піде в базу */
export default function FieldsEditor({ section, keys, value, onChange, errors }: {
  section: Section; keys: string[]; value: Data; onChange: (v: Data) => void; errors?: Record<string, string>;
}) {
  const fields = FIELDS[section].filter(f => keys.includes(f.key));
  return (
    <div className="wp-form">
      {fields.map(f => {
        const id = 'fe-' + f.key, raw = toInput(f, value[f.key]), err = errors?.[f.key];
        const set = (v: string | boolean) => onChange({ ...value, [f.key]: parseInput(f, v) });
        return (
          <div key={f.key} className={'fld' + (f.type === 'list' || f.type === 'longtext' ? ' wide' : '')}>
            {f.type === 'bool'
              ? <label className="mcheck"><input type="checkbox" checked={!!raw} onChange={e => set(e.target.checked)} />{f.label}</label>
              : <label htmlFor={id}>{f.label}</label>}
            {f.type === 'select' && <select id={id} value={String(raw)} onChange={e => set(e.target.value)}>{f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
            {(f.type === 'text' || f.type === 'int') && <input id={id} inputMode={f.type === 'int' ? 'numeric' : undefined} value={String(raw)} aria-invalid={!!err || undefined} onChange={e => set(e.target.value)} />}
            {(f.type === 'longtext' || f.type === 'list') && <textarea id={id} rows={f.type === 'list' ? 3 : 5} value={String(raw)} aria-invalid={!!err || undefined} onChange={e => set(e.target.value)} />}
            {f.type === 'list' && <small className="muted">Кожен пункт — окремий рядок.</small>}
            {err && <small className="err">{err}</small>}
          </div>
        );
      })}
    </div>
  );
}
