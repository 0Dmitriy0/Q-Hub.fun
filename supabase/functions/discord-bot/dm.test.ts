import { describe, expect, it } from 'vitest';
import { discord } from './discord';
import { DM_TEXT, dmBody, dmOutcome, sendDms, type DmItem, type Outcome } from './dm';

type Call = { url: string; init: RequestInit };
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function bot(responses: Response[]) {
  const calls: Call[] = [];
  const dc = discord('t', { fetch: async (url, init) => { calls.push({ url, init }); return responses.shift()!; }, sleep: async () => {} });
  return { dc, calls };
}
const item = (over: Partial<DmItem> = {}): DmItem =>
  ({ id: '91000000-0000-0000-0000-0000000000f1', title: '🏆 1 місце', body: 'Вітаємо!', prize: 'Набір', discord_user_id: '123456789012345678', ...over });

async function run(items: DmItem[], responses: Response[], enabled = true) {
  const { dc, calls } = bot(responses);
  const out: Record<string, Outcome> = {};
  const sum = await sendDms(items, dc, async (id, o) => { out[id] = o; }, { enabled });
  return { out, sum, calls };
}

describe('DM переможцю', () => {
  it('успіх: відкрити DM, надіслати embed без згадок → sent', async () => {
    const { out, calls } = await run([item()], [res({ id: 'dm1' }), res({ id: 'm1' })]);
    expect(out[item().id]).toEqual({ status: 'sent', error: '' });
    expect(calls[0].url).toMatch(/\/users\/@me\/channels$/);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ recipient_id: '123456789012345678' });
    expect(calls[1].url).toMatch(/\/channels\/dm1\/messages$/);
    const sent = JSON.parse(String(calls[1].init.body));
    expect(sent.allowed_mentions).toEqual({ parse: [] });
    expect(sent.embeds[0].description).toBe('Вітаємо!\n\n🎁 Приз: Набір');
  });
  it('50007 — закриті DM або немає спільного сервера → failed', async () => {
    const { out } = await run([item()], [res({ id: 'dm1' }), res({ code: 50007, message: 'Cannot send messages to this user' }, 403)]);
    expect(out[item().id]).toEqual({ status: 'failed', error: DM_TEXT.closed });
  });
  it('10013 — акаунт не знайдено → failed', async () => {
    const { out } = await run([item()], [res({ code: 10013, message: 'Unknown User' }, 400)]);
    expect(out[item().id]).toEqual({ status: 'failed', error: DM_TEXT.unknown });
  });
  it('429 двічі поспіль і 5xx → retry', async () => {
    const r1 = await run([item()], [res({ retry_after: 0.1 }, 429), res({ retry_after: 0.1 }, 429)]);
    expect(r1.out[item().id].status).toBe('retry');
    const r2 = await run([item()], [res({}, 502)]);
    expect(r2.out[item().id]).toEqual({ status: 'retry', error: DM_TEXT.down });
  });
  it('без Discord-ідентифікатора або DM вимкнено — failed без звернення до Discord', async () => {
    const a = await run([item({ discord_user_id: null })], []);
    expect(a.out[item().id]).toEqual({ status: 'failed', error: DM_TEXT.unknown });
    expect(a.calls).toHaveLength(0);
    const b = await run([item()], [], false);
    expect(b.out[item().id]).toEqual({ status: 'failed', error: DM_TEXT.off });
  });
  it('помилка одного не зупиняє решту пакета', async () => {
    const two = [item(), item({ id: '91000000-0000-0000-0000-0000000000f2' })];
    const { sum } = await run(two, [res({ code: 50007 }, 403), res({ id: 'dm2' }), res({ id: 'm2' })]);
    expect(sum).toEqual({ sent: 1, retry: 0, failed: 1 });
  });
  it('порожній приз — без рядка «Приз»', () => {
    expect(dmBody({ title: 't', body: 'b', prize: '  ' }).embeds![0].description).toBe('b');
    expect(dmOutcome(new Error('мережа'))).toEqual({ status: 'retry', error: DM_TEXT.down });
  });
});
