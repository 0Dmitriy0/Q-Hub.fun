import { describe, expect, it } from 'vitest';
import { adminError, compareVersions, isOldShot, releaseVersion, shotMeta } from './admin';

describe('адмін-панель: логіка', () => {
  it('версії: числами, а не рядком; стара збірка — в кінці', () => {
    expect(compareVersions('0.5.110', '0.5.99')).toBeLessThan(0);
    expect(['0.5.99', null, '0.6.0', '0.5.110'].sort(compareVersions)).toEqual(['0.6.0', '0.5.110', '0.5.99', null]);
    expect(compareVersions('0.6.3', '0.6.3')).toBe(0);
  });
  it('версія релізу — з назви інсталятора', () => {
    expect(releaseVersion([{ name: 'Q-Hub-Setup-0.5.110.exe' }, { name: 'latest.yml' }, { name: 'Q-Hub-Setup.exe' }])).toBe('0.5.110');
    expect(releaseVersion([{ name: 'latest.yml' }])).toBeNull();
    expect(releaseVersion(undefined)).toBeNull();
  });
  it('знімок: автор і файл мітки поруч', () => {
    expect(shotMeta('abc-uid/1730570000000.jpg')).toEqual({ owner: 'abc-uid', json: 'abc-uid/1730570000000.json' });
  });
  it('старий знімок — понад 90 днів', () => {
    const now = Date.parse('2026-11-02T12:00:00Z');
    expect(isOldShot('2026-07-01T00:00:00Z', now)).toBe(true);
    expect(isOldShot('2026-10-01T00:00:00Z', now)).toBe(false);
  });
  it('помилки бази — зрозумілим текстом', () => {
    expect(adminError({ code: '42501' })).toMatch(/Немає прав/);
    expect(adminError({ code: 'P0002' })).toMatch(/уже розібрано/);
    expect(adminError({ code: '22023', message: 'Свою роль admin зняти не можна' })).toBe('Свою роль admin зняти не можна');
    expect(adminError({ code: 'XX000', message: 'boom' })).toMatch(/спробуй ще/);
    expect(adminError(null)).toBe('');
  });
});
