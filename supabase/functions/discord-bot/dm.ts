/* Сповіщення переможцям у Discord DM (specs/091 US5; contracts/discord-dm.md).
   Чиста логіка без бази: вигляд повідомлення, відповідь Discord → статус, надсилання пакета. Запис статусу робить index.ts
   (notification_dm_result, 0078). Помилка одного DM не зупиняє решту пакета. */
import { DiscordError, type Body, type Discord } from './discord.ts';
import { COLOR } from './format.ts';

export type DmItem = { id: string; title: string; body: string; prize: string; discord_user_id: string | null };
export type DmStatus = 'sent' | 'retry' | 'failed';
export type Outcome = { status: DmStatus; error: string };

export const DM_TEXT = {
  closed: 'Закриті особисті повідомлення або немає спільного сервера з ботом',
  unknown: 'Акаунт Discord не знайдено',
  auth: 'Бот не авторизований',
  down: 'Discord тимчасово недоступний',
  off: 'Надсилання в Discord вимкнено',
};

/* embed із заголовком і текстом; приз — окремим рядком, лише якщо він є. Згадки (@everyone тощо) не пінгують */
export function dmBody(n: Pick<DmItem, 'title' | 'body' | 'prize'>, siteUrl = 'https://q-hub.fun/'): Body & { allowed_mentions: { parse: [] } } {
  const prize = n.prize.trim();
  return {
    embeds: [{ title: n.title.slice(0, 256), url: siteUrl, color: COLOR, description: (n.body + (prize ? `\n\n🎁 Приз: ${prize}` : '')).slice(0, 4096) }],
    allowed_mentions: { parse: [] },
  };
}

/* відповідь Discord → статус сповіщення */
export function dmOutcome(e: unknown): Outcome {
  if (e instanceof DiscordError) {
    if (e.code === 50007) return { status: 'failed', error: DM_TEXT.closed };
    if (e.code === 10013 || e.status === 404) return { status: 'failed', error: DM_TEXT.unknown };
    if (e.status === 403) return { status: 'failed', error: DM_TEXT.closed };
    if (e.status === 401) return { status: 'retry', error: DM_TEXT.auth };
    if (e.status === 400) return { status: 'failed', error: 'Discord не прийняв повідомлення' };
  }
  return { status: 'retry', error: DM_TEXT.down };
}

/* надіслати пакет: для кожного — відкрити DM і написати; результат віддати report. Повертає підсумок для журналу tick */
export async function sendDms(items: DmItem[], dc: Pick<Discord, 'openDm' | 'send'> | null, report: (id: string, o: Outcome) => Promise<void>,
  opts: { enabled: boolean } = { enabled: true }) {
  const sum = { sent: 0, retry: 0, failed: 0 };
  for (const n of items) {
    let o: Outcome;
    if (!opts.enabled || !dc) o = { status: 'failed', error: DM_TEXT.off };
    else if (!n.discord_user_id) o = { status: 'failed', error: DM_TEXT.unknown };
    else {
      try {
        const ch = await dc.openDm(n.discord_user_id);
        await dc.send(ch, dmBody(n), 'dm-' + n.id.replace(/-/g, ''));
        o = { status: 'sent', error: '' };
      } catch (e) { o = dmOutcome(e); }
    }
    sum[o.status]++;
    try { await report(n.id, o); } catch { /* статус не записався — сповіщення лишиться в черзі й піде наступного tick */ }
  }
  return sum;
}
