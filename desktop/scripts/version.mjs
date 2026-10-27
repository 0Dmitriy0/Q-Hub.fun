/* Версія програми: <перші дві цифри з package.json>.<скільки комітів пройшло відтоді, як їх змінили>.
   Змінили в package.json на 0.3.0 — перша збірка буде 0.3.0, далі 0.3.1, 0.3.2… Реліз «desktop-latest» оновлюється на кожну
   збірку з main, а програма вважає оновленням лише більшу версію: комітів у main тільки додається — тож номер росте.
   Потрібна повна історія git (fetch-depth: 0 у .github/workflows/desktop.yml). Запуск: node scripts/version.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const file = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(file, 'utf8'));
const base = pkg.version.split('.').slice(0, 2).join('.');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', cwd: new URL('..', import.meta.url) }).trim();
/* найстаріший коміт, де в package.json з'явилось «<base>.0» */
const since = git('log', '--format=%H', '-S', `"version": "${base}.0"`, '--', 'package.json').split('\n').filter(Boolean).pop();
if (!since) { console.error(`Не знайшов коміту з "version": "${base}.0" у desktop/package.json — потрібна повна історія git (fetch-depth: 0)`); process.exit(1); }
pkg.version = `${base}.${git('rev-list', '--count', `${since}..HEAD`)}`;
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log('Версія програми: ' + pkg.version);
