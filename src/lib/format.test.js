import { expect, it } from 'vitest';
import { parseMoney } from './format';
it('розуміє, як гравці пишуть суми', () => {
    expect(parseMoney('150 000')).toBe(150000);
    expect(parseMoney('150к')).toBe(150000);
    expect(parseMoney('1,5кк')).toBe(1500000);
    expect(parseMoney('2.5m')).toBe(2500000);
    expect(parseMoney('$3 768 038')).toBe(3768038);
});
