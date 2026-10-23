import { describe, expect, it } from 'vitest';
import { toAccelerator } from './hotkey';

const k = (code: string, key: string, m: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ code, key, ctrlKey: false, altKey: false, shiftKey: false, ...m });

describe('гаряча клавіша плашки', () => {
  it('літера з модифікатором — за фізичною клавішею, навіть на українській розкладці', () => {
    expect(toAccelerator(k('KeyQ', 'й', { altKey: true }))).toBe('Alt+Q');
    expect(toAccelerator(k('Digit2', '@', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+2');
  });
  it('F-клавіша може бути сама', () => {
    expect(toAccelerator(k('F10', 'F10'))).toBe('F10');
  });
  it('без модифікатора або лише модифікатор — ще не комбінація', () => {
    expect(toAccelerator(k('KeyQ', 'q'))).toBeNull();
    expect(toAccelerator(k('AltLeft', 'Alt', { altKey: true }))).toBeNull();
  });
});
