// Мовні дані OCR для «зору» програми: англійська — цифри HUD, українська — меню гри й ціни скупників. Беруться з пакета сайту й розпаковуються
// в src/ocr — tesseract.js у програмі читає їх з диска, без завантаження з інтернету.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const out = new URL('../src/ocr/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const l of ['eng', 'ukr']) {
  const file = new URL(l + '.traineddata', out);
  if (!existsSync(file)) writeFileSync(file, gunzipSync(readFileSync(new URL('../../node_modules/@tesseract.js-data/' + l + '/4.0.0_best_int/' + l + '.traineddata.gz', import.meta.url))));
}
console.log('ocr: eng + ukr ready');
