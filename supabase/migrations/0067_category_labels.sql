-- Q-Hub: назви міток — одна галочка на категорію (specs/081). Підпис під міткою на мапі (сайт і програма) малюється лише
-- в категоріях з show_labels = true; власний підпис мітки (map_points.show_label) діє всередині такої категорії.
-- Рішення власника 2026-11-14 (варіант A): і наявним, і новим категоріям — false; адмін вмикає назви там, де вони потрібні.
-- Змінює лише admin — наявна політика «map_categories: admin write» (0015). Файл можна запускати повторно.
alter table public.map_categories add column if not exists show_labels boolean not null default false;
