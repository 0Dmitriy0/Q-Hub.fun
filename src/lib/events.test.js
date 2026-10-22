import { describe, expect, it } from 'vitest';
import { eventStatus, kyHM, kyTs } from './events';
const at = (h, mi) => kyTs(2026, 10, 21, h, mi);
const get = (now, id) => eventStatus(now).find(s => s.ev.id === id);
describe('eventStatus', () => {
    it('НЛО о 23:30 іде (22:15–00:15), наступне завтра о 12:15', () => {
        const s = get(at(23, 30), 'ufo');
        expect(s.now && kyHM(s.now.e)).toBe('00:15');
        expect(s.next && kyHM(s.next.s)).toBe('12:15');
    });
    it('о 00:10 НЛО ще йде — з учорашнього слота', () => {
        expect(get(kyTs(2026, 10, 22, 0, 10), 'ufo').now).not.toBeNull();
    });
    it('GunGame лише в непарні години', () => {
        expect(kyHM(get(at(14, 30), 'gungame').next.s)).toBe('15:20');
    });
    it('рестарт без тривалості не буває «зараз»', () => {
        const s = get(at(5, 15), 'restart');
        expect(s.now).toBeNull();
        expect(kyHM(s.next.s)).toBe('05:15');
    });
    it('київський час враховує перехід на зимовий (25.10.2026)', () => {
        expect(kyTs(2026, 10, 26, 12, 0) - kyTs(2026, 10, 24, 12, 0)).toBe(49 * 3600000);
    });
});
