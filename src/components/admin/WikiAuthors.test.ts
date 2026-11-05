import { describe, expect, it } from 'vitest';
import { authorsOf, share } from './WikiAuthors';

describe('автори довідника', () => {
  it('рахує прийняті, нові сторінки, відхилені й частку; кращі зверху', () => {
    const p = (nick: string) => ({ name: 'Discord', nick, role: 'user' });
    const rows = authorsOf([
      { author: 'a', status: 'accepted', kind: 'edit', p: p('Alfa') },
      { author: 'a', status: 'rejected', kind: 'edit', p: p('Alfa') },
      { author: 'b', status: 'accepted', kind: 'new', p: p('Beta') },
      { author: 'b', status: 'accepted_edited', kind: 'edit', p: p('Beta') },
      { author: 'b', status: 'pending', kind: 'edit', p: p('Beta') },
      { author: 'c', status: 'withdrawn', kind: 'edit', p: null },
    ]);
    expect(rows.map(r => r.id)).toEqual(['b', 'a', 'c']);
    expect(rows[0]).toMatchObject({ who: 'Beta', accepted: 1, pages: 1, pending: 1, rejected: 0 });
    expect(share(rows[1])).toBe(50);
    expect(rows[2].who).toBe('гравець');
  });
});
