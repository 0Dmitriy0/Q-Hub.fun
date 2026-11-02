import { useEffect, useId, useRef, useState } from 'react';
import { FAMILY, useDiscordLinks } from '../lib/brand';

/* Кнопка «Discord» у підвалі: клік — плашка з вибором сервера (Q-Hub, сім'я, торговий майданчик). Запрошення — з
   public.site_links (0047), без бази — з коду (brand.ts). Закривається вибором, Esc або кліком поза нею; Esc повертає фокус */
export function DiscordLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="dlogo">
      <path fill="currentColor" d="M19.27 5.33A17.6 17.6 0 0 0 14.9 4l-.55 1.13a16.3 16.3 0 0 0-4.7 0L9.1 4a17.5 17.5 0 0 0-4.37 1.34C1.96 9.46 1.2 13.48 1.58 17.45a17.7 17.7 0 0 0 5.37 2.7l1.15-1.57a11.4 11.4 0 0 1-1.81-.87l.44-.34a12.6 12.6 0 0 0 10.54 0l.44.34c-.58.34-1.18.63-1.81.87l1.15 1.57a17.6 17.6 0 0 0 5.37-2.7c.45-4.6-.76-8.58-3.15-12.12zM8.68 15.02c-1.05 0-1.9-.96-1.9-2.13s.84-2.13 1.9-2.13c1.06 0 1.92.96 1.9 2.13 0 1.17-.84 2.13-1.9 2.13zm6.64 0c-1.05 0-1.9-.96-1.9-2.13s.84-2.13 1.9-2.13c1.06 0 1.92.96 1.9 2.13 0 1.17-.84 2.13-1.9 2.13z" />
    </svg>
  );
}

export default function DiscordMenu() {
  const [links] = useDiscordLinks();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    addEventListener('pointerdown', out); addEventListener('keydown', key);
    box.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', key); };
  }, [open]);
  if (!links) return null;
  const items: [string, string, string][] = [
    [links.site, 'Discord Q-Hub', 'Питання по сайту й програмі, помилки, ідеї'],
    [links.family, `Сім'я ${FAMILY}`, 'Сім\'я, що робить Q-Hub: вступ і спілкування'],
    [links.market, 'Торговий майданчик', 'Купівля й продаж між гравцями'],
  ];
  const shown = items.filter(([u]) => u);
  if (!shown.length) return null;
  return (
    <div className="dmenu" ref={box}>
      <button ref={btn} type="button" className="btn ghost dmenu-b" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
        <DiscordLogo />Discord<svg className="dmenu-chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
      </button>
      {open && (
        <div className="dmenu-pop" id={id} role="group" aria-label="Який Discord відкрити">
          <span className="dmenu-t">Обери сервер Discord</span>
          {shown.map(([u, name, about]) => (
            <a key={name} href={u} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
              <span className="dmenu-ico"><DiscordLogo size={20} /></span>
              <span><b>{name}</b><small>{about}</small></span>
              <span className="vh"> (відкриється в новій вкладці)</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
