/* Сховище сесії для supabase-js: JSON у файлі, зашифрований засобами ОС (Electron safeStorage — DPAPI у Windows).
   encrypt/decrypt передаються ззовні, щоб файл можна було перевірити тестом без Electron. */
const fs = require('node:fs');

function fileStorage(file, encrypt, decrypt) {
  let data = {};
  try { data = JSON.parse(decrypt(fs.readFileSync(file))); } catch { data = {}; }
  const save = () => fs.writeFileSync(file, encrypt(JSON.stringify(data)));
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; save(); },
    removeItem: k => { delete data[k]; save(); },
  };
}

module.exports = { fileStorage };
