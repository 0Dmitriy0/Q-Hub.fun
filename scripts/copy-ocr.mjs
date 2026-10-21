// Кладе файли розпізнавання тексту (Tesseract) у public/ocr, щоб сайт віддавав їх сам, без сторонніх CDN.
// Мовні дані розпаковуються: інакше сервер може вдруге стиснути .gz і браузер зламає їх.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const out = 'public/ocr'; mkdirSync(out, { recursive: true });
copyFileSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'])
  try { copyFileSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`); } catch { /* цього варіанта ядра може не бути в пакеті */ }
for (const l of ['ukr', 'eng'])
  writeFileSync(`${out}/${l}.traineddata`, gunzipSync(readFileSync(`node_modules/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`)));
console.log('ocr files ready');
