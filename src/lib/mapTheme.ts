import type L from 'leaflet';
import { recolor, type GameTheme } from './gameTheme';

/* тема мапи сайту (specs/019) — тема сайту: data-theme на <html> ставить index.html ще до першого кадру (FR-008),
   перемикає ThemeToggle. Світла палітра — та сама, що в «мапі для гри» (src/data/mapLight.json); мапа в програмі — завжди темна */
export const mapTheme = (): GameTheme => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
export const tone = (hex: string) => recolor(hex, mapTheme());

/* шар перемальовується, коли змінилась тема сайту; поки шар не на мапі — не стежить */
export function followTheme<T extends L.GridLayer>(layer: T, apply?: () => void): T {
  let obs: MutationObserver | null = null, last = mapTheme();
  layer.on('add', () => {
    last = mapTheme();
    obs = new MutationObserver(() => { const t = mapTheme(); if (t === last) return; last = t; apply?.(); layer.redraw(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  });
  layer.on('remove', () => { obs?.disconnect(); obs = null; });
  return layer;
}
