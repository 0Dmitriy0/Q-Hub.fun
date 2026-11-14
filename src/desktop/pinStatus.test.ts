import { describe, expect, it } from 'vitest';
import { pinStatus, pinTip } from './pinStatus';

describe('стан мітки Alt+F9 (specs/080)', () => {
  it('точку знайдено — зелений; гравець і адмін — свої заголовки', () => {
    const p = pinStatus({ point: { x: 12, y: -34 }, player: true });
    expect(p).toMatchObject({ tone: 'ok', title: 'Нова мітка на мапі', line: 'X 12 · Y -34' });
    expect(pinStatus({ point: { x: 1, y: 2 }, player: false }).title).toBe('Точку знайдено');
  });
  it('точку не знайдено — червоний, з причиною', () => {
    const p = pinStatus({ point: null, player: true, kind: 'zoom_in', reason: 'карта надто віддалена — наблизьте до 50–1500 м' });
    expect(p.tone).toBe('bad');
    expect(p.title).toBe('Точку не знайдено');
    expect(p.line).toBe('Причина: карта надто віддалена — наблизьте до 50–1500 м');
    expect(pinStatus({ player: true }).line).toBe('Причина: невідомо');
  });
  it('кожна з 6 причин — своя підказка, і кожна закінчується «Alt+F9 ще раз.»', () => {
    const kinds = ['no_map', 'zoom_in', 'zoom_out', 'unsure', 'no_ref', 'error'];
    const tips = kinds.map(pinTip);
    expect(new Set(tips).size).toBe(6);
    for (const t of tips) expect(t.endsWith('Alt+F9 ще раз.')).toBe(true);
  });
  it('невідомий код і null — «Натисніть Alt+F9 ще раз.»', () => {
    expect(pinTip('xxx')).toBe('Натисніть Alt+F9 ще раз.');
    expect(pinTip(null)).toBe('Натисніть Alt+F9 ще раз.');
  });
  it('гравцю без точки — що не надіслати і як інакше; адміну — можна без точки', () => {
    const pl = pinStatus({ player: true, kind: 'no_map', reason: 'не видно шкали', mapKey: 'Alt+M' });
    expect(pl.help.startsWith('Без точки мітку не надіслати.')).toBe(true);
    expect(pl.help).toContain('Відкрийте велику карту');
    expect(pl.help).toContain('Alt+M');
    const adm = pinStatus({ player: false, kind: 'unsure', reason: 'не впевнений у місці' });
    expect(adm.help).toContain('надіслати знімок без точки');
    expect(adm.help).toContain('чітке місце');
  });
});
