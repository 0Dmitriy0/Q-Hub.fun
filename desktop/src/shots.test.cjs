const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stamp, isBlack, store } = require('./shots.cjs');

test('знімки: назва за місцевим часом, сортується як рядок', () => {
  assert.equal(stamp(new Date(2026, 9, 3, 5, 7, 9)), '2026-10-03_05-07-09');
});

test('знімки: чорний кадр (повноекранний DirectX) і звичайний', () => {
  assert.equal(isBlack(Buffer.alloc(4 * 1920 * 1080)), true);
  const img = Buffer.alloc(4 * 1920 * 1080, 90);
  assert.equal(isBlack(img), false);
});

test('знімки: зберегти, позначити, порахувати; чужі назви й мітки — відмова', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qhub-shots-'));
  const s = store(dir), at = new Date(2026, 9, 23, 5, 0, 0);
  const a = s.save(Buffer.from('png'), at), b = s.save(Buffer.from('png'), at);
  assert.equal(a, '2026-10-23_05-00-00');
  assert.equal(b, '2026-10-23_05-00-00_2');
  assert.equal(s.label(a, 'buyer', 'Гриби'), true);
  assert.equal(s.label(b, 'hack'), false);
  assert.equal(s.label('../evil', 'buyer'), false);
  assert.deepEqual(s.stats(), { buyer: 1, sell: 0, buy: 0, bank: 0, job: 0, other: 0, unlabeled: 1 });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, a + '.json'), 'utf8')).note, 'Гриби');
});
