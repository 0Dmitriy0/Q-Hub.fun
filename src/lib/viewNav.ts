import type { MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

/* Рух сайту (редизайн 2026-11): перехід між розділами — через View Transitions. Браузер сам переносить помаранчеву
   риску активного розділу (елементи з view-transition-name у styles.css) зі старої вкладки на нову, а сторінка
   з'являється своєю анімацією з Layout.tsx. Без підтримки в браузері чи зі «зменшеним рухом» — звичайний перехід */
type WithVT = { startViewTransition?: (cb: () => void) => unknown };

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const canViewTransition = () => typeof document !== 'undefined' && typeof (document as Document & WithVT).startViewTransition === 'function' && !reducedMotion();

/* оновити сторінку всередині переходу: flushSync — щоб браузер зняв уже новий стан, а не проміжний */
export function viewTransition(update: () => void) {
  if (!canViewTransition()) { update(); return null; }
  return (document as Document & WithVT).startViewTransition!(() => flushSync(update));
}

/* обробник кліку для NavLink: звичайний клік — перехід з анімацією; Ctrl/Cmd/середня кнопка — як завжди (нова вкладка) */
export function useViewNav() {
  const navigate = useNavigate();
  return (to: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !canViewTransition()) return;
    e.preventDefault();
    viewTransition(() => navigate(to));
  };
}
