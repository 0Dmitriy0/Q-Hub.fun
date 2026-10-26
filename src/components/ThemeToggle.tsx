import { useEffect, useState } from 'react';

type Mode = 'dark' | 'light';
const KEY = 'qhub-theme2';
const OLD_KEY = 'qhub-theme'; // туди писалось 'auto' всім підряд — вірити можна лише явній світлій
const SHORT: Record<Mode, string> = { dark: 'Темна', light: 'Світла' };
const LABEL: Record<Mode, string> = { dark: 'Тема: темна', light: 'Тема: світла' };

function apply(m: Mode) {
  document.documentElement.setAttribute('data-theme', m);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m === 'light' ? '#f3f5f8' : '#10141a');
}

/* одна кнопка: темна (за замовчуванням) ⇄ світла; вибір пам'ятається в браузері.
   Режиму «як у системі» більше немає — збережене 'auto' читається як темна */
export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(() => {
    try { return localStorage.getItem(KEY) === 'light' || localStorage.getItem(OLD_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    apply(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* приватний режим */ }
  }, [mode]);
  const next: Mode = mode === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="btn theme" onClick={() => setMode(next)} aria-label={LABEL[mode] + '. Змінити'} title={LABEL[mode]}>
      {mode === 'dark' && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>}
      {mode === 'light' && <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>}
      <span className="theme-txt" aria-hidden="true">{SHORT[mode]}</span>
    </button>
  );
}
