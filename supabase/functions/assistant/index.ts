/* ШІ-помічник програми Q-Hub (Alt+Q). Програма шле { text, character_id, rules } з сесією гравця
   (rules — пункти правил сервера й законів штату, знайдені під питання у знімку rules-sync чи вбудованій src/data/rules.json, specs/010);
   функція бере ціни скупників, питає Claude і повертає { reply, actions: [] }. Облік гравця не читає й нічого не записує
   (облік прибрано, specs/040); actions лишається порожнім для старих версій програми. Ключ Anthropic — лише в секретах Supabase. */
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { SCHEMA, SYSTEM, checkRefs, clean, context, rulesBlock, type Ctx } from './plan.ts';

const KEY = Deno.env.get('ANTHROPIC_API_KEY');
const anthropic = KEY ? new Anthropic({ apiKey: KEY }) : null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, error: string) => json({ error }, status);

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

  const prices = await sb.from('buyer_items').select('price,min_price,max_price,buyers(name),items(name)');
  const c: Ctx = {
    prices: ((prices.data ?? []) as unknown as { price: number; min_price: number; max_price: number; buyers: { name: string } | null; items: { name: string } | null }[])
      .filter(p => p.buyers && p.items)
      .map(p => ({ buyer: p.buyers!.name, item: p.items!.name, price: Number(p.price) || 0, min: Number(p.min_price) || 0, max: Number(p.max_price) || 0 })),
  };

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `${context(c)}\n\n${rulesBlock(rules)}Гравець пише: ${text.trim()}` }],
    });
    if (res.stop_reason === 'refusal') return json({ reply: 'З цим не допоможу.', actions: [] });
    const block = res.content.find(b => b.type === 'text');
    if (res.stop_reason === 'max_tokens' || !block || block.type !== 'text') return fail(502, 'Помічник не договорив — спробуй коротше');
    const plan = clean(JSON.parse(block.text));
    return json({ ...plan, reply: checkRefs(plan.reply, rules) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail(503, 'Помічник перевантажений — спробуй за хвилину');
    if (e instanceof Anthropic.APIError) return fail(502, 'Помічник недоступний — спробуй пізніше');
    if (e instanceof SyntaxError) return fail(502, 'Помічник відповів незрозуміло — спробуй ще раз');
    console.error(e);
    return fail(500, 'Помічник зламався — спробуй пізніше');
  }
});
