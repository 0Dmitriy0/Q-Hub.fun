/* Споживання програми (specs/090): замір пам'яті й процесора всіх процесів разом, хвилинна згортка для журналу usage.log,
   перевищення бюджету й сторож пам'яті. Чиста логіка без Electron — перевіряється usage.test.cjs; main.cjs лише годує її
   результатом app.getAppMetrics() і виконує дії сторожа. Журнал лишається на ПК гравця й нікуди не відправляється (FR-012). */

/* бюджет (spec.md FR-001…FR-004, research.md R5). Пам'ять — МБ, процесор — % усього процесора, як у Диспетчері завдань */
const BUDGET = {
  memMax: 1500, memSoft: 1200, memHard: 1400, memOk: 1100,
  cpu: { idle: 1, background: 5, active: 10 },
  window: { idle: 5 * 60e3, background: 10 * 60e3, active: 10 * 60e3 },   // за який час рахується середнє
  spike: { pct: 25, over: 10, ms: 5000 },
  guardPause: 2 * 60e3,   // та сама дія сторожа — не частіше
  overPause: 60e3,        // той самий вид перевищення в журналі — не частіше
};
const STATES = ['idle', 'background', 'active'];
/* що звільняє сторож: soft — те, чим зараз не користуються; hard — ще й усе розпізнавання та потік екрана
   (наступний кадр створить їх заново). Черги відправки, сесії й видимих вікон тут немає й бути не може (FR-006) */
const SOFT = ['lists', 'map', 'timer', 'rule', 'locator'], HARD = [...SOFT, 'ocr', 'grab'];

/* знімок app.getAppMetrics() → один замір. cpuDiv — на скільки ділити суму percentCPUUsage, щоб вийшла частка всього
   процесора (1, якщо метрика вже така; кількість потоків, якщо вона від одного ядра) */
function sample(metrics, state, now, cpuDiv = 1) {
  let cpu = 0, mem = 0, ws = 0;
  for (const m of metrics || []) {
    cpu += Number(m.cpu?.percentCPUUsage) || 0;
    const w = Number(m.memory?.workingSetSize) || 0;
    ws += w; mem += Number(m.memory?.privateBytes) || w;   // privateBytes є лише на Windows
  }
  return { at: now, state, cpu: cpu / (cpuDiv || 1), mem: mem / 1024, ws: ws / 1024, procs: (metrics || []).length };
}

const avg = a => a.reduce((s, x) => s + x, 0) / a.length;

/* хвилинна згортка й перевищення. trace — заміри щосекунди: лише тоді видно сплеск «довше 5 с» */
function createMeter(budget = BUDGET, { trace = false } = {}) {
  let first = true, bucket = [], bucketAt = 0;
  let run = [], runState = null, runAt = 0;   // заміри поспіль в одному стані — для середнього за вікно
  let aboveAt = 0;
  const overAt = new Map();
  const over = (out, now, o) => { if (now - (overAt.get(o.kind) ?? -Infinity) >= budget.overPause) { overAt.set(o.kind, now); out.push({ type: 'OVER', at: now, ...o }); } };
  return {
    feed(s) {
      const out = { minute: null, over: [] };
      /* перший замір після запуску метрика процесора віддає нулем */
      if (first) { first = false; bucketAt = s.at; return out; }
      if (bucket.length && s.at - bucketAt >= 60e3) {
        const n = {};
        for (const b of bucket) n[b.state] = (n[b.state] || 0) + 1;
        out.minute = {
          type: 'MIN', at: s.at, state: STATES.reduce((a, b) => ((n[b] || 0) > (n[a] || 0) ? b : a)),
          cpu: avg(bucket.map(b => b.cpu)), cpuMax: Math.max(...bucket.map(b => b.cpu)),
          mem: Math.max(...bucket.map(b => b.mem)), ws: Math.max(...bucket.map(b => b.ws)), procs: Math.max(...bucket.map(b => b.procs)),
        };
        bucket = []; bucketAt = s.at;
      }
      bucket.push(s);

      if (s.mem > budget.memMax) over(out.over, s.at, { kind: 'mem', value: s.mem, limit: budget.memMax });
      /* середнє — лише за повне вікно в одному стані: зміна стану починає відлік заново */
      if (s.state !== runState) { runState = s.state; run = []; runAt = s.at; }
      const win = budget.window[s.state], lim = budget.cpu[s.state];
      run.push(s);
      while (run.length && s.at - run[0].at > win) run.shift();
      if (win && s.at - runAt >= win) {
        const a = avg(run.map(r => r.cpu));
        if (a > lim) over(out.over, s.at, { kind: 'cpu-' + s.state, value: a, limit: lim, window: Math.round(win / 60e3) + 'm' });
      }
      if (trace) {
        if (s.cpu > budget.spike.over) aboveAt ||= s.at; else aboveAt = 0;
        if (s.cpu > budget.spike.pct) over(out.over, s.at, { kind: 'spike', value: s.cpu, limit: budget.spike.pct });
        else if (aboveAt && s.at - aboveAt > budget.spike.ms) over(out.over, s.at, { kind: 'spike', value: s.cpu, limit: budget.spike.over, window: Math.round((s.at - aboveAt) / 1000) + 's' });
      }
      return out;
    },
  };
}

/* сторож пам'яті: ok → soft (memSoft) → hard (memHard); назад в ok — лише нижче memOk, щоб поріг не «тремтів».
   feed повертає дії, які треба виконати зараз (порожньо — нічого) */
function createGuard(budget = BUDGET) {
  let level = 'ok', softAt = -Infinity, hardAt = -Infinity;
  return {
    get level() { return level; },
    feed(mem, now) {
      const was = level;
      if (mem < budget.memOk) level = 'ok';
      else if (mem >= budget.memHard) level = 'hard';
      else if (mem >= budget.memSoft && level !== 'hard') level = 'soft';
      let actions = [];
      if (mem >= budget.memHard) {
        if (now - hardAt >= budget.guardPause) { hardAt = softAt = now; actions = HARD; }
      } else if (mem >= budget.memSoft && now - softAt >= budget.guardPause) { softAt = now; actions = SOFT; }
      return { level, changed: level !== was, actions: [...actions] };
    },
  };
}

const f1 = x => (Math.round(x * 10) / 10).toFixed(1), int = x => String(Math.round(x));
/* запис → рядок журналу (contracts/usage-log.md) */
function line(r) {
  const head = `${new Date(r.at).toISOString()} ${r.type}`;
  if (r.type === 'START') return `${head} v=${r.v} cores=${r.cores} ram=${r.ram}`;
  if (r.type === 'MIN') return `${head} state=${r.state} cpu=${f1(r.cpu)} cpuMax=${f1(r.cpuMax)} mem=${int(r.mem)} ws=${int(r.ws)} procs=${r.procs}`;
  if (r.type === 'S') return `${head} state=${r.state} cpu=${f1(r.cpu)} mem=${int(r.mem)}`;
  if (r.type === 'T') return `${head} kind=${r.kind} ms=${int(r.ms)}`;
  if (r.type === 'V') return `${head} ${Object.entries(r.stat).map(([k, v]) => `${k}=${int(v)}`).join(' ')}`.trimEnd();
  if (r.type === 'OVER') return `${head} kind=${r.kind} value=${r.kind === 'mem' ? int(r.value) : f1(r.value)} limit=${r.limit}${r.window ? ' window=' + r.window : ''}`;
  if (r.type === 'PRESSURE') return `${head} level=${r.level} before=${int(r.before)} after=${int(r.after)} did=${r.did.join(',') || '-'}`;
  return `${head} ${JSON.stringify(r)}`;
}

/* стан програми для заміру (research.md R4): немає ігрової сесії — простій; видно плашку, мапу чи «Окремо» або щойно
   читали список скупника — користування; інакше фон. Смужка й таймер стану не змінюють */
function stateOf({ session, windowShown, listsAt, now }) {
  if (!session) return 'idle';
  return windowShown || now - (listsAt || -Infinity) < 10e3 ? 'active' : 'background';
}

module.exports = { BUDGET, SOFT, HARD, sample, createMeter, createGuard, line, stateOf };
