import { describe, expect, it } from 'vitest';
import { chunks, forumTopics, links, numOf, postText, topicTitle } from './parse';

/* пост IPS у тому вигляді, як його віддає форум */
const post = (id: number, user: string, body: string) => `<div id='comment-${id}_wrap'><div data-commentID="${id}" data-quoteData='{&quot;username&quot;:&quot;${user}&quot;}'></div>`
  + `<div data-role='commentContent' class='ipsType_richText'>${body}</div><div class='cPostShareMenu'></div></div>`;

describe('розбір тем форуму (specs/010)', () => {
  it('перший пост і продовження того самого автора; чужі відповіді — ні; сутності й теги — текстом', () => {
    const h = 'шапка' + post(1, 'Admin', '<p>1.1 Заборонено&nbsp;DM.</p><p>3</p>') + post(2, 'Гравець', '<p>Питання?</p>') + post(3, 'Admin', '<p>1.2 Заборонено&nbsp;&laquo;PG&raquo;</p>');
    expect(postText(h)).toEqual(['1.1 Заборонено DM.', '1.2 Заборонено «PG»']);
  });

  it('кодекс: розділи й статті — у заголовок пункту, «Покарання: …» — усередині пункту', () => {
    const items = chunks(['РОЗДІЛ 6. ЗЛОЧИНИ ПРОТИ ВЛАСНОСТІ', 'Стаття 6. Викрадення', '6.5 [Р] Викрадення, тобто неправомірне заволодіння автомобілем.', 'Покарання: позбавлення волі до 3 років.', 'Розділ I. Загальні положення', '1.1 Кодекс встановлює порядок.']);
    expect(items).toEqual([
      { n: '6.5', h: 'Стаття 6. Викрадення', s: '[Р] Викрадення, тобто неправомірне заволодіння автомобілем.\nПокарання: позбавлення волі до 3 років.' },
      { n: '1.1', h: 'Розділ I. Загальні положення', s: 'Кодекс встановлює порядок.' },
    ]);
  });

  it('правила сервера — як і раніше: «2. Основні поняття» — заголовок, абзаци без номера — шматками до ~700 символів', () => {
    const long = 'а'.repeat(400);
    const items = chunks(['2. Основні поняття', 'DM — вбивство без причини.', '2.1 Заборонено DM.', 'Примітка до пункту.', '3. Зелені зони:', long, long, long]);
    expect(items[0]).toEqual({ n: '', h: 'Основні поняття', s: 'DM — вбивство без причини.' });
    expect(items[1]).toEqual({ n: '2.1', h: 'Основні поняття', s: 'Заборонено DM.\nПримітка до пункту.' });
    expect(items.slice(2).map(i => i.h)).toEqual(['Зелені зони', 'Зелені зони']);
    expect(items.slice(2).every(i => !i.n)).toBe(true);
  });

  it('довгий рядок, що починається з «1.», — не заголовок, а абзац', () => {
    const l = '1. Цей кодекс встановлює єдині правила дорожнього руху, що встановлюють порядок дорожнього руху в штаті Quant.';
    expect(chunks([l])).toEqual([{ n: '', h: '', s: l }]);
  });

  it('посилання на розділи й теми, номер з адреси, назва теми без розділу й сайту', () => {
    const h = `<a href="https://forum.quant5.com.ua/index.php?/forum/36-законодавча-база-штату/">x</a><a href='index.php?/topic/153-кримінальний-кодекс/'>y</a><a href='index.php?/topic/153-кримінальний-кодекс/'>z</a>`;
    expect(links(h, 'forum')).toEqual(['index.php?/forum/36-законодавча-база-штату']);
    expect(links(h, 'topic')).toEqual(['index.php?/topic/153-кримінальний-кодекс']);
    expect(numOf('index.php?/topic/153-кримінальний-кодекс')).toBe(153);
    expect(topicTitle('<title>Кримінальний кодекс штату Quant - Законодавча база Штату - QuantRP</title>', 'Законодавча база Штату')).toBe('Кримінальний кодекс штату Quant');
  });
});

describe('обхід розділу (specs/010)', () => {
  const row = (u: string) => `<h4 class="ipsDataItem_title ipsType_break"> <a href="https://forum.quant5.com.ua/${u}/">x</a>`;
  const crumbs = `<a href='https://forum.quant5.com.ua/index.php?/forum/9-ігровий-розділ/'>Ігровий</a>`;
  const site: Record<string, string> = {
    'index.php?/forum/10-правила/': `<h1>Правила серверу</h1>${crumbs}${row('index.php?/forum/11-загальні')}<a href='index.php?/topic/5-з-підрозділу/'>останнє</a><a href='index.php?/topic/1-закріплена/'>t</a>`,
    'index.php?/forum/11-загальні/': `<h1>Загальні правила</h1>${crumbs}<a href='index.php?/topic/5-з-підрозділу/'>t</a><a href='index.php?/forum/11-загальні/page/2/'>2</a>`,
    'index.php?/forum/11-загальні/page/2/': `<a href='index.php?/topic/6-друга-сторінка/'>t</a>`,
  };
  const get = async (p: string) => { if (!(p in site)) throw new Error('немає ' + p); return site[p]; };

  it('підрозділи (не крихти), усі сторінки; тема з підрозділу — під своїм розділом і один раз', async () => {
    expect(await forumTopics(get, 'index.php?/forum/10-правила')).toEqual([
      { url: 'index.php?/topic/5-з-підрозділу', section: 'Загальні правила' },
      { url: 'index.php?/topic/6-друга-сторінка', section: 'Загальні правила' },
      { url: 'index.php?/topic/1-закріплена', section: 'Правила серверу' },
    ]);
  });
});
