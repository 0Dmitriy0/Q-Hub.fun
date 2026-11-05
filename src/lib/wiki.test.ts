import { describe, expect, it } from 'vitest';
import { dbError, diff, diffRows, FIELDS, parseInput, similar, slugFromName, validate } from './wiki';

describe('довідник: поля', () => {
  it('білий список — як у базі (wiki_clean, 0057)', () => {
    expect(FIELDS.job.map(f => f.key).sort()).toEqual(['controls', 'description', 'features', 'legal', 'level', 'location', 'name', 'pay', 'profit', 'progress', 'requirements', 'skills', 'tips']);
    const car = FIELDS.vehicle.map(f => f.key);
    expect(car).not.toContain('image_url');
    expect(car).not.toContain('model');
    expect(car).toContain('salon_price');
  });
});

describe('було → стало', () => {
  const old = { name: 'Акванавт', level: 7, pay: '', tips: ['А', 'Б'], salon_price: null };
  it('лише змінені поля; порожнє й null — однакові', () => {
    expect(diff('job', old, { name: 'Акванавт', level: 8, pay: '', tips: ['А', 'Б'] })).toEqual({ level: 8 });
    expect(diff('vehicle', old, { salon_price: null })).toEqual({});
    expect(diff('job', old, { tips: ['А', 'В'] })).toEqual({ tips: ['А', 'В'] });
  });
  it('списки — додані й прибрані пункти', () => {
    const [r] = diffRows('job', old, { tips: ['А', 'В'] });
    expect(r.added).toEqual(['В']); expect(r.removed).toEqual(['Б']); expect(r.label).toBe('Поради');
  });
});

describe('схожі назви й адреса', () => {
  const list = [{ id: 'akvanavt', name: 'Акванавт' }, { id: 'bus', name: 'Водій автобуса' }];
  it('знаходить дублі', () => {
    expect(similar('акванавт', list).map(x => x.id)).toEqual(['akvanavt']);
    expect(similar('водій автобус', list).map(x => x.id)).toEqual(['bus']);
    expect(similar('пілот', list)).toEqual([]);
  });
  it('транслітерація', () => {
    expect(slugFromName('Водій автобуса')).toBe('vodii-avtobusa');
    expect(slugFromName('Щука & Їжак')).toBe('shchuka-izhak');
    expect(slugFromName('!')).toBe('');
  });
});

describe('перевірка форми', () => {
  it('межі з data-model', () => {
    expect(validate('job', { name: '' }, true).name).toBeTruthy();
    expect(validate('job', { id: 'pilot', name: 'Пілот', level: 101 }, true).level).toContain('100');
    expect(validate('job', { profit: 4 }, false).profit).toContain('3');
    expect(validate('job', { pay: 'x'.repeat(301) }, false).pay).toContain('300');
    expect(validate('job', { description: 'x'.repeat(3001) }, false).description).toContain('3000');
    expect(validate('job', { tips: ['x'.repeat(401)] }, false).tips).toContain('400');
    expect(validate('job', { tips: Array(31).fill('x') }, false).tips).toContain('30');
    expect(validate('job', { name: 'Пілот' }, true).id).toBeTruthy();
    expect(validate('job', { id: 'pilot', name: 'Пілот' }, true)).toEqual({});
    expect(validate('vehicle', { salon_price: null }, false)).toEqual({});
    expect(validate('vehicle', { name: 'X' }, true).kind).toBeTruthy();
  });
  it('поле форми → значення', () => {
    const tips = FIELDS.job.find(f => f.key === 'tips')!, sp = FIELDS.vehicle.find(f => f.key === 'salon_price')!;
    expect(parseInput(tips, ' a \n\n b ')).toEqual(['a', 'b']);
    expect(parseInput(sp, '1 250 000')).toBe(1250000);
    expect(parseInput(sp, '')).toBeNull();
  });
  it('помилки бази', () => {
    expect(dbError({ code: 'QH002', message: 'На розгляді вже 10' })).toBe('На розгляді вже 10');
    expect(dbError({ code: '42501', message: 'new row violates row-level security policy' })).toContain('Немає прав');
  });
});
