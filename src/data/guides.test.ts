import { describe, expect, it } from 'vitest';
import { GUIDES } from './guides';
import { JOBS } from './jobs';
import sitemap from '../../public/sitemap.xml?raw';

describe('гайди WIKI', () => {
  it('адреси унікальні й латиницею', () => {
    const slugs = GUIDES.map(g => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]{2,40}$/);
  });
  it('у таблицях стільки клітинок, скільки стовпців', () => {
    for (const g of GUIDES) for (const b of g.blocks) if (b.k === 'table')
      for (const r of b.rows) expect(r.length, `${g.slug}: ${r[0]}`).toBe(b.head.length);
  });
  it('посилання ведуть на наявні роботи й гайди', () => {
    const jobs = new Set(JOBS.map(j => j.id)); const guides = new Set(GUIDES.map(g => g.slug));
    for (const g of GUIDES) for (const b of g.blocks) if (b.k === 'links') for (const l of b.items) {
      const job = l.to.match(/^\/wiki\/roboty\?job=(.+)$/)?.[1]; const guide = l.to.match(/^\/wiki\/gaidy\/(.+)$/)?.[1];
      if (job) expect(jobs.has(job) || ['farmer', 'pilot'].includes(job), `${g.slug} → ${job}`).toBe(true);
      else if (guide) expect(guides.has(guide), `${g.slug} → ${guide}`).toBe(true);
      else expect(l.to).toMatch(/^\/wiki\//);
    }
  });
  it('кожен гайд є в sitemap.xml', () => {
    for (const g of GUIDES) expect(sitemap).toContain(`https://q-hub.fun/wiki/gaidy/${g.slug}<`);
  });
});
