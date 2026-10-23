// Мовні дані OCR для «зору» програми (лише англійська: читаємо цифри HUD). Беруться з пакета сайту й розпаковуються
// в src/ocr — tesseract.js у програмі читає їх з диска, без завантаження з інтернету.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const out = new URL('../src/ocr/', import.meta.url), file = new URL('eng.traineddata', out);
if (!existsSync(file)) {
  mkdirSync(out, { recursive: true });
  writeFileSync(file, gunzipSync(readFileSync(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', import.meta.url))));
}
console.log('ocr: eng.traineddata ready');
