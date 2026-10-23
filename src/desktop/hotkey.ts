/* натиснута комбінація → гаряча клавіша Electron («Alt+Q», «Ctrl+Shift+F2»). null — ще не комбінація:
   лише модифікатори, або звичайна клавіша без модифікатора (інакше вона перестала б друкуватися в грі) */
export interface Keys { key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

export function toAccelerator(e: Keys): string | null {
  const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5)
    : /^F([1-9]|1[0-2])$/.test(e.key) ? e.key : ['Space', 'Backquote', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.code) ? (e.code === 'Backquote' ? '`' : e.code) : null;
  if (!key) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as string[];
  if (!mods.length && !/^F\d+$/.test(key)) return null;
  return [...mods, key].join('+');
}
