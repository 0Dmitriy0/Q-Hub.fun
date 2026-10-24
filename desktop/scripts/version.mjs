/* Номер збірки у версії програми: 0.2.<номер запуску CI>. Реліз «desktop-latest» оновлюється на кожну збірку з main,
   і програма вважає оновленням лише більшу версію — тож кожна збірка мусить мати новий номер.
   Перші дві цифри (0.2) — з package.json, їх змінюємо вручну на великих змінах. Запуск: node scripts/version.mjs <номер> */
import { readFileSync, writeFileSync } from 'node:fs';

const n = Number(process.argv[2]);
if (!Number.isInteger(n) || n < 1) { console.error('Потрібен номер збірки: node scripts/version.mjs <число>'); process.exit(1); }
const file = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(file, 'utf8'));
pkg.version = pkg.version.split('.').slice(0, 2).join('.') + '.' + n;
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log('Версія програми: ' + pkg.version);
