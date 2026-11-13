/* Сховище сесії для supabase-js: JSON у файлі, зашифрований засобами ОС (Electron safeStorage — DPAPI у Windows).
   encrypt/decrypt передаються ззовні, щоб файл можна було перевірити тестом без Electron. */
const fs = require('node:fs');

/* запис файла цілим: спершу поруч у .tmp, потім перейменування. Програму вбили чи зникло живлення посеред запису —
   лишається попередній файл, а не обрізаний: биті settings.json чи session.bin означали б «немає персонажа, увійди знову» */
function writeAtomic(file, data) {
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch {
    /* перейменувати не дали (антивірус тримає файл) — пишемо напряму, як раніше */
    try { fs.rmSync(tmp, { force: true }); } catch { /* не страшно */ }
    fs.writeFileSync(file, data);
  }
}

/* журнал для діагностики не росте без кінця: більший за max — лишається хвіст (keep байтів, з початку цілого рядка) */
function trimLog(file, max = 2e6, keep = 2e5) {
  try {
    const { size } = fs.statSync(file);
    if (size <= max) return false;
    const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(Math.min(keep, size));
    try { fs.readSync(fd, buf, 0, buf.length, size - buf.length); } finally { fs.closeSync(fd); }
    const nl = buf.indexOf(10);
    fs.writeFileSync(file, nl >= 0 ? buf.subarray(nl + 1) : buf);
    return true;
  } catch { return false; }   // файла ще немає
}

function fileStorage(file, encrypt, decrypt) {
  let data = {};
  try { data = JSON.parse(decrypt(fs.readFileSync(file))); } catch { data = {}; }
  const save = () => writeAtomic(file, encrypt(JSON.stringify(data)));
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; save(); },
    removeItem: k => { delete data[k]; save(); },
  };
}

module.exports = { fileStorage, writeAtomic, trimLog };
