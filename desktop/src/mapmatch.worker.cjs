/* Окремий потік для mapmatch.cjs: зіставлення триває до ~2 с, головний процес програми за цей час не підвисає.
   init — еталон і заздалегідь порахований грубий пошук для всіх масштабів (щоб F9 не чекав на це);
   locate — знімок (BGRA) + число зі шкали → результат. */
const { parentPort } = require('node:worker_threads');
const mm = require('./mapmatch.cjs');

let ref = null;
const cache = {};

parentPort.on('message', msg => {
  try {
    if (msg.type === 'init') {
      ref = mm.parseRef(Buffer.from(msg.bin), msg.meta);
      parentPort.postMessage({ id: msg.id, ok: true });
      mm.warm(ref, cache);   // після відповіді: F9 уже можна тиснути, кеш добудовується у фоні
      return;
    }
    if (msg.type === 'locate') {
      if (!ref) return parentPort.postMessage({ id: msg.id, result: { kind: 'unsure', reason: 'no_ref' } });
      const frame = { width: msg.width, height: msg.height, data: Buffer.from(msg.data) };
      const t0 = Date.now();
      const result = mm.locate(frame, ref, msg.meters, { cache });
      parentPort.postMessage({ id: msg.id, result: { ...result, ms: Date.now() - t0 } });
    }
  } catch (e) {
    parentPort.postMessage({ id: msg.id, error: String(e?.stack || e) });
  }
});
