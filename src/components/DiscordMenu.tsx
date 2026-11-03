import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';
import { FAMILY, useLinks, type LinkKey } from '../lib/brand';

/* кнопка «Discord» у підвалі (макет власника 2026-11-03): відкриває вгору список «Обери сервер Discord» —
   сайт Q-Hub, сім'я CORE, торговий майданчик (0048). Показуються лише задані адміном посилання; жодного — кнопки немає.
   Esc чи клік поза меню — закрити й повернути фокус на кнопку */
const SERVERS: [LinkKey, string, string][] = [
  ['discord_url', 'Discord Q-Hub', 'Питання по сайту й програмі, помилки, ідеї'],
  ['family_url', `Сім'я ${FAMILY}`, `Сім'я, що робить Q-Hub: вступ і спілкування`],
  ['market_url', 'Торговий майданчик', 'Купівля й продаж між гравцями'],
];

export function DiscordMark({ size = 18 }: { size?: number }) {
  return <svg width={size} height={Math.round(size * 0.76)} viewBox="0 0 127 96" aria-hidden="true"><path fill="currentColor" d="M107.7 8.1A105 105 0 0 0 81.5 0a72 72 0 0 0-3.4 6.8 97.7 97.7 0 0 0-29.1 0A72 72 0 0 0 45.6 0a105.9 105.9 0 0 0-26.2 8.1C2.8 32.6-1.7 56.6.5 80.2a105.7 105.7 0 0 0 32.2 16.2 77.7 77.7 0 0 0 6.9-11.1 68.4 68.4 0 0 1-10.8-5.2c.9-.7 1.8-1.4 2.7-2.1a75.6 75.6 0 0 0 64.3 0c.9.7 1.8 1.4 2.7 2.1a68.7 68.7 0 0 1-10.9 5.2 77 77 0 0 0 6.9 11.1 105.3 105.3 0 0 0 32.2-16.2c2.6-27.4-4.6-51.2-19.1-72.1ZM42.5 65.7c-6.3 0-11.4-5.7-11.4-12.8s5-12.8 11.4-12.8 11.5 5.8 11.4 12.8c0 7-5 12.8-11.4 12.8Zm42.2 0c-6.3 0-11.4-5.7-11.4-12.8s5-12.8 11.4-12.8 11.5 5.8 11.4 12.8c0 7-5 12.8-11.4 12.8Z" /></svg>;
}

export default function DiscordMenu() {
  const [links] = useLinks();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const list = SERVERS.filter(([k]) => links[k]);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!list.length) return null;
  return (
    <div className="dmenu" ref={box}>
      {open && (
        <div className="dmenu-pop" id={id}>
          <span className="dmenu-h mono">Обери сервер Discord</span>
          <ul>
            {list.map(([k, name, sub]) => (
              <li key={k}>
                <a href={links[k]} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                  <span className="dmenu-ico"><DiscordMark size={20} /></span>
                  <span><b>{name}</b><small>{sub}</small></span>
                  <span className="vh"> (відкриється в новій вкладці)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button ref={btn} type="button" className="btn ghost dmenu-btn" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(o => !o)}>
        <DiscordMark size={16} />Discord<Icon name="chev" size={14} className={open ? 'tu' : ''} />
      </button>
    </div>
  );
}
