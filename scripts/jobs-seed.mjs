// Роботи з src/data/jobs.ts → SQL для міграції 0057 (specs/043): insert … on conflict (id) do nothing.
// Запуск: node scripts/jobs-seed.mjs > out.sql. Повторний запуск міграції нічого не дублює й не затирає правок гравців.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/data/jobs.ts', import.meta.url), 'utf8');
const head = 'export const JOBS: Job[] =';
const body = src.slice(src.indexOf(head) + head.length);
const jobs = JSON.parse(body.slice(0, body.lastIndexOf(']') + 1));

const q = s => `'${String(s).replace(/'/g, "''")}'`;
const arr = a => (a?.length ? `array[${a.map(q).join(', ')}]::text[]` : `'{}'::text[]`);
const LISTS = ['requirements', 'features', 'location', 'skills', 'progress', 'controls', 'tips'];

const rows = jobs.map(j => `  (${[q(j.id), q(j.name), j.legal, j.level, j.profit, ...LISTS.map(k => arr(j[k])), q(j.description ?? ''), q(j.pay ?? ''), !!j.forum].join(', ')})`);
console.log(`insert into public.jobs (id, name, legal, level, profit, ${LISTS.join(', ')}, description, pay, forum) values\n${rows.join(',\n')}\non conflict (id) do nothing;`);
