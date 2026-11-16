-- Q-Hub: шрифт напису на мапі за замовчуванням — Unbounded (рішення власника 2026-11-16).
-- Написи, що лишились на старому шрифті за замовчуванням (Roboto Condensed), переходять на Unbounded —
-- тим самим шрифтом вони йдуть і в мапу для гри. Написи з іншим шрифтом, вибраним адміном, не змінюються.
-- Файл можна запускати повторно.

alter table public.map_labels alter column font set default 'unbounded';
update public.map_labels set font = 'unbounded' where font = 'roboto-condensed';
