import { describe, expect, it } from 'vitest';
import { diffText, normalizeSourceUrl } from './ruleSources';

describe('адреса джерела правил', () => {
  it('закодована з браузера, без «/» у кінці, з /page/2 і #коментарем — одна форма', () => {
    const want = { url: 'https://forum.quant5.com.ua/index.php?/forum/10-правила-серверу/' };
    expect(normalizeSourceUrl('https://forum.quant5.com.ua/index.php?/forum/10-%D0%BF%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0-%D1%81%D0%B5%D1%80%D0%B2%D0%B5%D1%80%D1%83/')).toEqual(want);
    expect(normalizeSourceUrl(' https://forum.quant5.com.ua/index.php?/forum/10-правила-серверу ')).toEqual(want);
    expect(normalizeSourceUrl('https://forum.quant5.com.ua/index.php?/forum/10-правила-серверу/page/2/')).toEqual(want);
    expect(normalizeSourceUrl('https://forum.quant5.com.ua/index.php?/topic/7-kk/#comment-5')).toEqual({ url: 'https://forum.quant5.com.ua/index.php?/topic/7-kk/' });
  });
  it('чужий сайт, http, профіль, підробка домену — відмова', () => {
    for (const s of ['https://quantfun.com.ua/index.php?/forum/1-x/', 'http://forum.quant5.com.ua/index.php?/forum/1-x/',
      'https://forum.quant5.com.ua/index.php?/profile/1-x/', 'https://forumXquant5.com.ua/index.php?/topic/1-x/', 'не посилання'])
      expect(normalizeSourceUrl(s)).toHaveProperty('error');
  });
});

describe('різниця оновлення', () => {
  it('коротко', () => {
    expect(diffText(null)).toBe('—');
    expect(diffText({ added: 0, changed: 0, removed: 0 })).toBe('без змін');
    expect(diffText({ added: 3, changed: 1, removed: 2 })).toBe('+3 · змінено 1 · −2');
  });
});
