import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export interface Opt<T extends string | number> { value: T; label: string; icon?: string; hint?: string }

/* Випадний список у стилі сайту замість стандартного браузерного.
   Клавіатура: ↑/↓ — вибір, Enter/Пробіл — підтвердити, Esc — закрити, Home/End; у довгих списках є пошук.
   Вікно позиціюється над усім (fixed), тож не обрізається таблицями з прокруткою, і саме розгортається вгору біля низу екрана. */
export default function Select<T extends string | number>({ value, options, onChange, label, placeholder = 'Вибери…', className = '', searchable }: {
  value: T | ''; options: Opt<T>[]; onChange: (v: T) => void; label?: string; placeholder?: string; className?: string; searchable?: boolean;
}) {
  const id = useId(), btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null), find = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; max: number }>({ left: 0, top: 0, width: 0, up: false, max: 320 });
  const withSearch = searchable ?? options.length > 10;
  const ql = q.trim().toLowerCase();
  const list = ql ? options.filter(o => o.label.toLowerCase().includes(ql)) : options;
  const cur = options.find(o => o.value === value);

  function place() {
    const r = btn.current!.getBoundingClientRect(), below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 240 && above > below;
    setPos({ left: Math.min(r.left, innerWidth - Math.max(r.width, 220) - 8), top: up ? r.top - 6 : r.bottom + 6, width: Math.max(r.width, 220), up, max: Math.min(340, Math.max(160, up ? above : below)) });
  }
  function show() { place(); setQ(''); setActive(Math.max(0, options.findIndex(o => o.value === value))); setOpen(true); }
  function pick(o: Opt<T>) { onChange(o.value); setOpen(false); btn.current?.focus(); }

  useLayoutEffect(() => { if (open) (withSearch ? find.current : pop.current)?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const close = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('pointerdown', away); addEventListener('scroll', close, true); addEventListener('resize', close);
    return () => { removeEventListener('pointerdown', away); removeEventListener('scroll', close, true); removeEventListener('resize', close); };
  }, [open]);
  useEffect(() => { pop.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, open]);

  function key(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(list.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(list.length - 1); }
    else if (e.key === 'Enter' || (e.key === ' ' && !withSearch)) { e.preventDefault(); if (list[active]) pick(list[active]); }
    else if (e.key === 'Tab') setOpen(false);
  }

  return (
    <>
      <button ref={btn} type="button" className={'sel ' + className + (open ? ' open' : '')} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={label}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); show(); } }}>
        {cur?.icon && <Icon name={cur.icon} size={16} />}
        <span className={'sel-v' + (cur ? '' : ' ph')}>{cur ? cur.label : placeholder}</span>
        <svg className="sel-chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {/* вікно — в кінці сторінки (portal): так клік по пункту не «пробивається» в <label>, що обгортає кнопку */}
      {open && createPortal(
        <div ref={pop} className={'sel-pop' + (pos.up ? ' up' : '')} tabIndex={-1} onKeyDown={key}
          style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: innerHeight - pos.top } : { top: pos.top }) }}>
          {withSearch && <div className="sel-find"><Icon name="search" size={15} /><input ref={find} value={q} placeholder="Пошук…" aria-label="Пошук у списку" aria-controls={id}
            onChange={e => { setQ(e.target.value); setActive(0); }} /></div>}
          <ul id={id} role="listbox" aria-label={label} style={{ maxHeight: pos.max - (withSearch ? 52 : 0) }} aria-activedescendant={list[active] ? `${id}-${active}` : undefined}>
            {list.map((o, i) => (
              <li key={String(o.value)} id={`${id}-${i}`} data-i={i} role="option" aria-selected={o.value === value}
                className={(i === active ? 'act' : '') + (o.value === value ? ' on' : '')} onPointerMove={() => setActive(i)} onClick={() => pick(o)}>
                {o.icon && <Icon name={o.icon} size={16} />}
                <span className="sel-l">{o.label}{o.hint && <small>{o.hint}</small>}</span>
                {o.value === value && <svg className="sel-ok" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
              </li>))}
            {!list.length && <li className="sel-none" aria-disabled="true">Нічого не знайдено</li>}
          </ul>
        </div>, document.body
      )}
    </>
  );
}
