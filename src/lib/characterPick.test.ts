import { describe, expect, it } from 'vitest';
import { pickPlan } from './characterPick';

const a = { id: 'a', name: 'Dmitriy_Core', static_id: 171028 }, b = { id: 'b', name: 'Jacson_Coreee', static_id: 188231 };

describe('вибір персонажа для ручної ціни', () => {
  it('немає персонажів — спершу додати', () => {
    expect(pickPlan([])).toMatchObject({ kind: 'none', error: expect.stringMatching(/додай персонажа/) });
  });
  it('один — без питання', () => {
    expect(pickPlan([a], null)).toEqual({ kind: 'auto', id: 'a' });
  });
  it('два-три — питати, підказка — поточний', () => {
    expect(pickPlan([a, b], 'b')).toEqual({ kind: 'ask', options: [a, b], suggested: 'b' });
    expect(pickPlan([a, b], 'зник')).toMatchObject({ kind: 'ask', suggested: 'a' });
  });
  it('персонаж без статіку не пропонується; лише без статіку — попросити вказати статік', () => {
    const old = { id: 'o', name: 'Old', static_id: null };
    expect(pickPlan([old, a], 'o')).toEqual({ kind: 'auto', id: 'a' });
    expect(pickPlan([old])).toMatchObject({ kind: 'none', error: expect.stringMatching(/статік/) });
  });
});
