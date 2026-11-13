import { describe, expect, it } from 'vitest';
import { streamView } from './streamer';

const user = { name: 'dmytro#1', avatar: 'https://cdn/a.png', nick: 'D_VYRX', nickChangedAt: '2026-10-01' };
const chars = [{ id: 'a', name: 'Dmitriy_Core', static: 171028 }, { id: 'b', name: 'Other_Name', static: null }];

describe('режим стрімера: підписи в плашці', () => {
  it('вимкнено — усе як є', () => {
    expect(streamView(user, chars, false)).toEqual({ user, characters: chars });
  });
  it('увімкнено — жодного ніка, імені Discord, аватара, імені персонажа чи статіка', () => {
    const v = streamView(user, chars, true);
    const text = JSON.stringify(v);
    for (const secret of ['D_VYRX', 'dmytro', 'cdn', 'Dmitriy_Core', 'Other_Name', '171028']) expect(text).not.toContain(secret);
    expect(v.user).toMatchObject({ nick: 'Гравець', name: 'Гравець', avatar: null });
    expect(v.characters).toEqual([{ id: 'a', name: 'Персонаж 1', static: null }, { id: 'b', name: 'Персонаж 2', static: null }]);
  });
  it('id персонажів лишаються — перемикання працює; без входу — без користувача', () => {
    expect(streamView(null, chars, true).user).toBeNull();
    expect(streamView(user, chars, true).characters.map(c => c.id)).toEqual(['a', 'b']);
  });
});
