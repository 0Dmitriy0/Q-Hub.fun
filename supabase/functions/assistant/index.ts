/* ШІ-помічник програми Q-Hub (Alt+Q). Програма шле { text, character_id, rules } з сесією гравця
   (rules — пункти правил сервера й законів штату, знайдені під питання у знімку rules-sync чи вбудованій src/data/rules.json, specs/010);
   функція бере ціни скупників, питає Claude і повертає { reply, actions: [] }. Облік гравця не читає й нічого не записує
   (облік прибрано, specs/040); actions лишається порожнім для старих версій програми. Ключ Anthropic — лише в секретах Supabase.
   Пошук програми йде за словами гравця й пропускає сленг («угон» — у законі «викрадення»), тож помічник може сам шукати
   по всіх правилах офіційними словами (інструмент search_rules, до SEARCHES разів): знімок rules-sync із публічного бакета. */
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { SYSTEM, SEARCH_TOOL, checkRefs, context, rulesBlock, type Ctx } from './plan.ts';
import { rulesExcerpt, searchRules, type RuleTopic } from './rulesSearch.ts';

const KEY = Deno.env.get('ANTHROPIC_API_KEY');
const anthropic = KEY ? new Anthropic({ apiKey: KEY }) : null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, error: string) => json({ error }, status);
const SEARCHES = 3, RULES_TTL = 10 * 60e3;

/* знімок правил (rules-sync) — у пам'яті екземпляра функції на RULES_TTL; не вийшло — без пошуку, лише пункти від програми */
let rulesCache: { at: number; topics: RuleTopic[] } | null = null;
async function topics(): Promise<RuleTopic[]> {
  if (rulesCache && Date.now() - rulesCache.at < RULES_TTL) return rulesCache.topics;
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/rules/rules.json`);
    const j = r.ok ? await r.json() as { topics?: RuleTopic[] } : null;
    if (j?.topics?.length) rulesCache = { at: Date.now(), topics: j.topics };
  } catch (e) { console.error('rules.json', e); }
  return rulesCache?.topics ?? [];
}

Deno.serve(async req => {
  if (req.method !== 'POST') return fail(405, 'Лише POST');
  if (!anthropic) { console.error('ANTHROPIC_API_KEY не задано в секретах функції'); return fail(503, 'Помічник ще не налаштований — поки шукай у правилах через Enter'); }
  const auth = req.headers.get('Authorization');
  if (!auth) return fail(401, 'Увійди в програму');
  const { text, rules } = await req.json().catch(() => ({}));
  if (typeof text !== 'string' || !text.trim() || text.length > 500) return fail(400, 'Напиши питання, до 500 символів');

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: ok, error: e0 } = await sb.rpc('assistant_take');
  if (e0) return fail(401, 'Сесія застаріла — перезайди в програму');
  if (!ok) return fail(429, 'Ліміт помічника на сьогодні вичерпано — завтра знову. Пошук у правилах (Enter) працює й без нього.');

  const [prices, all] = await Promise.all([sb.from('buyer_items').select('price,min_price,max_price,buyers(name),items(name)'), topics()]);
  const c: Ctx = {
    prices: ((prices.data ?? []) as unknown as { price: number; min_price: number; max_price: number; buyers: { name: string } | null; items: { name: string } | null }[])
      .filter(p => p.buyers && p.items)
      .map(p => ({ buyer: p.buyers!.name, item: p.items!.name, price: Number(p.price) || 0, min: Number(p.min_price) || 0, max: Number(p.max_price) || 0 })),
  };

  /* усе, що помічник бачив (пункти від програми й знайдене пошуком), — для перевірки номерів у відповіді (checkRefs) */
  let seen = typeof rules === 'string' ? rules : '';
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `${context(c)}\n\n${rulesBlock(rules)}Гравець пише: ${text.trim()}` }];
  const tools = all.length ? [SEARCH_TOOL] : undefined;
  try {
    for (let round = 0; ; round++) {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-5-5',
        max_tokens: 4000,
        system: SYSTEM,
        output_config: { effort: 'medium' },
        /* пошуки скінчились — інструмент лишається в запиті (історія має tool_use), але викликати його вже не можна: лише відповідь */
        ...(tools ? { tools, ...(round >= SEARCHES ? { tool_choice: { type: 'none' as const } } : {}) } : {}),
        messages,
      });
      if (res.stop_reason === 'refusal') return json({ reply: 'З цим не допоможу.', actions: [] });
      if (res.stop_reason === 'max_tokens') return fail(502, 'Помічник не договорив — спробуй коротше');
      const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (res.stop_reason === 'tool_use' && calls.length) {
        messages.push({ role: 'assistant', content: res.content });
        messages.push({ role: 'user', content: calls.map(b => {
          const q = String((b.input as { query?: unknown })?.query ?? '').slice(0, 200);
          const found = q ? rulesExcerpt(searchRules(all, q, 20), 10000) : '';
          seen += '\n' + found;
          return { type: 'tool_result' as const, tool_use_id: b.id, content: found || 'Нічого не знайдено — спробуй інші слова.' };
        }) });
        continue;
      }
      const reply = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('').trim().slice(0, 2000);
      if (!reply) return fail(502, 'Помічник відповів незрозуміло — спробуй ще раз');
      return json({ reply: checkRefs(reply, seen), actions: [] });
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail(503, 'Помічник перевантажений — спробуй за хвилину');
    if (e instanceof Anthropic.APIError) return fail(502, 'Помічник недоступний — спробуй пізніше');
    console.error(e);
    return fail(500, 'Помічник зламався — спробуй пізніше');
  }
});
