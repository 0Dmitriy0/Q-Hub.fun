import { useEffect, useState } from 'react';

type Mode = 'auto' | 'dark' | 'light';
const KEY = 'qhub-theme';
const ORDER: Mode[] = ['auto', 'dark', 'light'];
const SHORT: Record<Mode, string> = { auto: 'Авто', dark: 'Темна', light: 'Світла' };
const LABEL: Record<Mode, string> = { auto: 'Тема: як у системі', dark: 'Тема: темна', light: 'Тема: світла' };

const systemLight = () => !!window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
function apply(m: Mode) {
  const light = m === 'light' || (m === 'auto' && systemLight());
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f6f5f3' : '#070707');
}

/* одна кнопка: як у системі → темна → світла; вибір пам'ятається в браузері */
export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem(KEY) as Mode) || 'auto'; } catch { return 'auto'; } });
  useEffect(() => {
    apply(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* приватний режим */ }
    if (mode !== 'auto' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => apply('auto');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mode]);
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  return (
    <button type="button" className="btn theme" onClick={() => setMode(next)} aria-label={LABEL[mode] + '. Змінити'} title={LABEL[mode]}>
      {mode === 'dark' && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>}
      {mode === 'light' && <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>}
      {mode === 'auto' && <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></svg>}
      <span className="theme-txt" aria-hidden="true">{SHORT[mode]}</span>
    </button>
  );
}
