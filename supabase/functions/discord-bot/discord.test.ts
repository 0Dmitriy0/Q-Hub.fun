import { describe, expect, it } from 'vitest';
import { API, DiscordError, discord, human } from './discord';

const TOKEN = 'secret-token-123';
type Call = { url: string; init: RequestInit };

function fake(responses: Response[]) {
  const calls: Call[] = [];
  const slept: number[] = [];
  const d = discord(TOKEN, {
    fetch: async (url, init) => { calls.push({ url, init }); return responses.shift()!; },
    sleep: async ms => { slept.push(ms); },
  });
  return { d, calls, slept };
}
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('discord REST', () => {
  it('send: POST у канал з токеном бота, без згадок @everyone', async () => {
    const { d, calls } = fake([ok({ id: '999' })]);
    expect(await d.send('123', { content: 'привіт' })).toBe('999');
    expect(calls[0].url).toBe(API + '/channels/123/messages');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bot ' + TOKEN);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ content: 'привіт', allowed_mentions: { parse: [] } });
  });

  it('crosspost: правильна адреса', async () => {
    const { d, calls } = fake([ok({})]);
    await d.crosspost('123', '456');
    expect(calls[0].url).toBe(API + '/channels/123/messages/456/crosspost');
  });

  it('429 → чекає retry_after і повторює один раз', async () => {
    const { d, calls, slept } = fake([ok({ retry_after: 1.5 }, 429), ok({ id: '1' })]);
    expect(await d.send('123', { content: 'x' })).toBe('1');
    expect(calls).toHaveLength(2);
    expect(slept).toEqual([1500]);
  });

  it('429 двічі → помилка rate, третьої спроби немає', async () => {
    const { d, calls } = fake([ok({ retry_after: 1 }, 429), ok({ retry_after: 1 }, 429)]);
    await expect(d.send('123', {})).rejects.toMatchObject({ kind: 'rate', status: 429 });
    expect(calls).toHaveLength(2);
  });

  it('довгий retry_after не чекає в межах виклику', async () => {
    const { d, slept } = fake([ok({ retry_after: 600 }, 429)]);
    await expect(d.send('123', {})).rejects.toBeInstanceOf(DiscordError);
    expect(slept).toEqual([]);
  });

  it.each([[401, 'auth'], [403, 'forbidden'], [404, 'not_found'], [400, 'bad'], [500, 'other']])('%i → %s', async (status, kind) => {
    const { d } = fake([ok({ message: 'x' }, status)]);
    await expect(d.channel('123')).rejects.toMatchObject({ kind, status });
  });

  it('текст помилки ніколи не містить токена', async () => {
    for (const s of [400, 401, 403, 404, 429, 500]) {
      const { d } = fake([ok({ retry_after: 600 }, s)]);
      const e = await d.send('1', {}).catch(x => x as DiscordError);
      expect(e.message).not.toContain(TOKEN);
    }
  });

  it('human: що зробити, з назвою каналу', () => {
    expect(human('forbidden', 403, 'ціни')).toContain('#ціни');
    expect(human('auth', 401)).toContain('DISCORD_BOT_TOKEN');
  });
});
