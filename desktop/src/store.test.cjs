const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeAtomic, trimLog } = require('./store.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qhub-store-'));

test('writeAtomic: файл замінюється цілим, тимчасового поруч не лишається', () => {
  const d = tmp(), f = path.join(d, 'settings.json');
  writeAtomic(f, '{"a":1}');
  writeAtomic(f, '{"a":2}');
  assert.equal(fs.readFileSync(f, 'utf8'), '{"a":2}');
  assert.deepEqual(fs.readdirSync(d), ['settings.json']);
});

test('writeAtomic: запис обірвався на тимчасовому файлі — попередній файл цілий', () => {
  const d = tmp(), f = path.join(d, 'settings.json');
  writeAtomic(f, '{"character":"c1"}');
  /* як після вбитого процесу: обрізаний .tmp лишився, справжній файл не чіпали */
  fs.writeFileSync(f + '.tmp', '{"chara');
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { character: 'c1' });
  writeAtomic(f, '{"character":"c2"}');
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { character: 'c2' });
  assert.deepEqual(fs.readdirSync(d), ['settings.json']);
});

test('trimLog: малий журнал не чіпає, великий обрізає до хвоста з початку цілого рядка', () => {
  const d = tmp(), f = path.join(d, 'pin.log');
  assert.equal(trimLog(f), false);   // файла ще немає
  const lines = Array.from({ length: 200 }, (_, i) => `рядок ${String(i).padStart(3, '0')}`);
  fs.writeFileSync(f, lines.join('\n') + '\n');
  assert.equal(trimLog(f, 1e6), false);
  assert.equal(trimLog(f, 1000, 300), true);
  const left = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  assert.ok(left.length > 5 && left.length < 30);
  assert.equal(left.at(-1), 'рядок 199');
  for (const l of left) assert.match(l, /^рядок \d{3}$/);   // жодного обрізаного рядка
});
