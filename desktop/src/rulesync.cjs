/* Правила форуму з ПК адміна (specs/095). Форум QuantRP (Cloudflare) не пускає сервер Q-Hub (403 з дата-центру),
   а ПК адміна під тією ж справжньою назвою пускає (200). Раз на 24 год, якщо за добу не було вдалого оновлення,
   програма адміна сама обходить форум спільним кодом (lib/rulecrawl.cjs ← supabase/functions/rules-sync/crawl.ts)
   і надсилає розібрані теми функції rules-sync ({ via: 'app' }); функція перевіряє роль і кладе знімок, як після свого обходу.
   Чесно: та сама назва «Q-Hub rules sync», пауза між сторінками, на відмові чи перевірці «я не робот» — зупинка,
   нічого не надсилаємо й не обходимо. Гравцям — нічого: лише роль admin.
   Мережа, база, час і файли — ззовні, щоб перевірити тестом без Electron. */
const fs = require('fs');
const path = require('path');

const FORUM = 'https://forum.quant5.com.ua/';
const UA = 'Mozilla/5.0 Q-Hub rules sync';
const DAY = 24 * 3600e3;

/* форум не пустив — обриваємо весь запуск (crawl stop) */
class ForumBlocked extends Error {}

/* сторінка перевірки Cloudflare чи взагалі не форум IPS */
const challenge = (status, headers, html) =>
  !!headers?.get?.('cf-mitigated') || /challenge-platform|cf-chl-|Just a moment\.\.\.|Attention Required! \| Cloudflare/i.test(html);
const looksLikeForum = html => /ipsLayout|ipsType_|data-role=['"]commentContent|ipsDataItem/.test(html);

function createRuleSync({ dir, fetch, crawl, sb, role, version, now = Date.now, pause = 1000, sleep = ms => new Promise(r => setTimeout(r, ms)), log: extLog }) {
  const stateFile = () => path.join(dir(), 'rulesync.json');
  const logFile = () => path.join(dir(), 'rulesync.log');
  const log = m => { try { fs.appendFileSync(logFile(), `${new Date(now()).toISOString()} ${m}\n`); } catch { /* журнал не обов'язковий */ } extLog?.(m); };
  const read = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } };
  const write = s => { try { fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2)); } catch { /* наступного разу */ } };
  let busy = false;

  /* одна сторінка форуму: лише хост форуму, по одній з паузою; блок → ForumBlocked, 404 теми — звичайна помилка джерела */
  let pages = 0;
  async function get(p) {
    const u = new URL(p, FORUM);
    if (u.origin + '/' !== FORUM) throw new Error('не форум сервера: ' + u.origin);
    if (pages++) await sleep(pause);
    let r;
    try { r = await fetch(u.href, { headers: { 'User-Agent': UA } }); } catch (e) { throw new ForumBlocked('немає зв\'язку з форумом: ' + (e?.message || e)); }
    const html = r.ok ? await r.text() : '';
    if (r.status === 403 || r.status === 429 || r.status === 503 || challenge(r.status, r.headers, html)) throw new ForumBlocked(`форум не пускає (відповідь ${r.status}${r.ok ? ', перевірка «я не робот»' : ''})`);
    if (!r.ok) throw new Error(`форум відповів ${r.status}`);
    if (!looksLikeForum(html)) throw new ForumBlocked('замість сторінки форуму прийшло щось інше — зупиняюсь');
    return html;
  }

  /* чи пора: лише admin; власна спроба — не частіше разу на 24 год; і за базою — ні одного вдалого оновлення за 24 год */
  async function due() {
    if (role() !== 'admin') return { due: false, why: 'не адмін' };
    const s = read();
    if (s.lastAttempt && now() - Date.parse(s.lastAttempt) < DAY) return { due: false, why: 'спроба вже була ' + s.lastAttempt };
    const { data, error } = await sb.from('rules_sync_runs').select('at,via').eq('ok', true).order('at', { ascending: false }).limit(1).maybeSingle();
    if (error) return { due: false, why: 'база недоступна: ' + error.message };
    if (data && now() - Date.parse(data.at) < DAY) return { due: false, why: `уже оновлено ${data.at} (${data.via})` };
    return { due: true };
  }

  async function run() {
    if (busy) return { result: 'busy' };
    busy = true; pages = 0;
    const done = (result, note) => { write({ lastAttempt: new Date(now()).toISOString(), lastResult: result, note }); log(result + (note ? ': ' + note : '')); return { result, note }; };
    try {
      const { data: rows, error } = await sb.from('rule_sources').select('id,url,kind,enabled').order('id');
      if (error) return done('server', 'джерела не прочитано: ' + error.message);
      const sources = (rows || []).filter(s => s && typeof s.id === 'number');
      if (!sources.some(s => s.enabled)) return done('server', 'немає увімкнених джерел');
      log(`почав: джерел ${sources.filter(s => s.enabled).length}`);
      let c;
      try { c = await crawl(get, sources, e => e instanceof ForumBlocked); }
      catch (e) { if (e instanceof ForumBlocked) return done('forum', e.message + ` (сторінок прочитано: ${pages})`); throw e; }
      const items = c.fresh.reduce((n, t) => n + t.items.length, 0);
      log(`прочитав сторінок ${pages}: тем ${c.fresh.length}, пунктів ${items}, помилок джерел ${c.errors.size}`);
      const { data, error: fe } = await sb.functions.invoke('rules-sync', { body: { via: 'app', version, fresh: c.fresh, errors: [...c.errors], titles: [...c.titles] } });
      if (fe) {
        let why = fe.message;
        try { const b = await fe.context?.json?.(); if (b?.error) why = b.error; } catch { /* лишаємо message */ }
        return done('server', why);
      }
      return done(data?.fetched ? 'ok' : 'server', `тем ${data?.topics ?? '?'}, пунктів ${data?.items ?? '?'}, змін ${data?.changes ?? 0}` + (data?.fetched ? '' : ' — жодне джерело не оновилось'));
    } catch (e) {
      return done('net', e?.message || String(e));
    } finally { busy = false; }
  }

  /* перевірити й, якщо пора, оновити; тихо — без вікон і сповіщень */
  async function tick() {
    try {
      const d = await due();
      if (!d.due) return { result: 'skip', note: d.why };
      return await run();
    } catch (e) { log('збій перевірки: ' + (e?.message || e)); return { result: 'net' }; }
  }

  return { due, run, tick, get, state: read };
}

module.exports = { createRuleSync, ForumBlocked, DAY, UA };
