/* ШІ-помічник програми Q-Hub (Alt+Q). Програма шле { text, character_id } з сесією гравця;
   функція читає його дані тими самими правами (RLS), питає Claude і повертає { reply, actions }.
   Нічого не записує — записує програма після Enter гравця. Ключ Anthropic — лише в секретах Supabase. */
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { SCHEMA, SYSTEM, clean, context, type Ctx } from './plan.ts';

const KEY = Deno.env.get('ANTHROPIC_API_KEY');
const anthropic = KEY ? new Anthropic({ apiKey: KEY }) : null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, error: string) => json({ error }, status);

Deno.serve(async req => {
  if (req.method !== 'POST') return fail(405, 'Лише POST');
  if (!anthropic) { console.error('ANTHROPIC_API_KEY не задано в секретах функції'); return fail(503, 'Помічник ще не налаштований — запиши через Shift+Enter'); }
  const auth = req.headers.get('Authorization');
  if (!auth) return fail(401, 'Увійди в програму');
  const { text, character_id } = await req.json().catch(() => ({}));
  if (typeof text !== 'string' || !text.trim() || text.length > 500) return fail(400, 'Напиши, що сталося, до 500 символів');
  if (typeof character_id !== 'string') return fail(400, 'Обери персонажа');

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: ok, error: e0 } = await sb.rpc('assistant_take');
  if (e0) return fail(401, 'Сесія застаріла — перезайди в програму');
  if (!ok) return fail(429, 'Ліміт помічника на сьогодні вичерпано — завтра знову. Записати можна й без нього.');

  const [ch, tx, deals, prices] = await Promise.all([
    /* «*» — щоб працювало й до міграції 0017 (start_card, account) */
    sb.from('characters').select('*').eq('id', character_id).maybeSingle(),
    sb.from('transactions').select('*').eq('character_id', character_id).limit(10000),
    sb.from('deals').select('op,item,qty,price,ts').eq('character_id', character_id).limit(5000),
    sb.from('buyer_items').select('price,min_price,max_price,buyers(name),items(name)'),
  ]);
  if (!ch.data) return fail(404, 'Персонажа не знайдено');
  const c: Ctx = {
    character: ch.data.name,
    balance: (tx.data ?? []).reduce((s, t) => s + (t.type === 'in' ? 1 : -1) * Number(t.amount), Number(ch.data.start_balance) || 0),
    card: (tx.data ?? []).reduce((s, t) => s + (t.account === 'card' ? (t.type === 'in' ? 1 : -1) * Number(t.amount) : 0), Number(ch.data.start_card) || 0),
    deals: (deals.data ?? []).map(d => ({ ...d, qty: Number(d.qty), price: Number(d.price) })),
    prices: ((prices.data ?? []) as unknown as { price: number; min_price: number; max_price: number; buyers: { name: string } | null; items: { name: string } | null }[])
      .filter(p => p.buyers && p.items)
      .map(p => ({ buyer: p.buyers!.name, item: p.items!.name, price: Number(p.price) || 0, min: Number(p.min_price) || 0, max: Number(p.max_price) || 0 })),
  };
  c.cash = c.balance - (c.card ?? 0);
  /* останні записи — щоб помічник міг їх виправити чи видалити на прохання гравця */
  c.recent = [...(tx.data ?? [])].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 15)
    .map(t => ({ id: t.id, type: t.type, amount: Number(t.amount), category: t.category, note: t.note || '', ts: t.ts, account: t.account === 'card' ? 'card' : 'cash', source: t.source || 'manual' }));

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `${context(c)}\n\nГравець пише: ${text.trim()}` }],
    });
    if (res.stop_reason === 'refusal') return json({ reply: 'З цим не допоможу.', actions: [] });
    const block = res.content.find(b => b.type === 'text');
    if (res.stop_reason === 'max_tokens' || !block || block.type !== 'text') return fail(502, 'Помічник не договорив — спробуй коротше');
    return json(clean(JSON.parse(block.text), c));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail(503, 'Помічник перевантажений — спробуй за хвилину');
    if (e instanceof Anthropic.APIError) return fail(502, 'Помічник недоступний — спробуй пізніше');
    if (e instanceof SyntaxError) return fail(502, 'Помічник відповів незрозуміло — спробуй ще раз');
    console.error(e);
    return fail(500, 'Помічник зламався — запиши через Shift+Enter');
  }
});
