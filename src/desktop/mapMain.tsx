import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import MapPage from '../pages/MapPage';
import type { Where } from './MapWhere';
import Icon from '../components/Icon';
import '../styles.css';
import './bar.css';

/* мапа Q-Hub поверх гри (map.html → desktop/src/ui/map.html, specs/014): та сама сторінка мапи, що на сайті, лише перегляд.
   Плашка в стилі «Історії»: шапка з назвою, клавішею й хрестиком; Esc чи клавіша мапи ховають її, фокус — назад у гру */
type Focus = { id?: string; x: number; y: number };
interface MapApi {
  mapHide(): Promise<void>; mapKey(): Promise<string | null>; site(path: string): Promise<void>;
  mapFocusTake(): Promise<Focus | null>; onMapFocus(cb: (p: Focus) => void): () => void;
  mapWhere(): Promise<Where>; onMapWhere(cb: (r: Where) => void): () => void; onMapShown(cb: () => void): () => void;
}
const api = (window as unknown as { qhub: MapApi }).qhub;

function MapWin() {
  const [key, setKey] = useState('');
  /* місце з пошуку плашки: n — щоб той самий пункт удруге теж центрував мапу */
  const [focus, setFocus] = useState<(Focus & { n: number }) | null>(null);
  /* «Де я?»: кнопкою — відповідь одразу, клавішею при відкритій великій карті гри — подіями з головного процесу */
  const [where, setWhere] = useState<Where>(null);
  useEffect(() => api.onMapWhere(setWhere), []);
  /* щоразу, як вікно показали: мітки — оновити, якщо застаріли (FR-012) */
  const [shown, setShown] = useState(0);
  useEffect(() => api.onMapShown(() => setShown(n => n + 1)), []);
  const findMe = async () => { setWhere({ state: 'busy' }); setWhere(await api.mapWhere()); };
  useEffect(() => { api.mapKey().then(k => setKey(k || '')); }, []);
  useEffect(() => {
    const take = (p: Focus | null) => { if (p) setFocus({ ...p, n: Date.now() }); };
    api.mapFocusTake().then(take);
    return api.onMapFocus(take);
  }, []);
  useEffect(() => {
    /* Esc у полі пошуку спершу очищає пошук (браузер робить це сам) — ховаємо лише з порожнього поля чи поза ним */
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLInputElement;
      if (t.tagName === 'INPUT' && t.value) return;
      e.preventDefault(); api.mapHide();
    };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, []);
  return (
    <div className="mwin">
      <header className="hhead mapwin-h">
        <b>Мапа</b>
        {key && <span className="mwin-k">{key} · Esc — сховати</span>}
        <button className="bico" title="Сховати · Esc" aria-label="Сховати мапу" onClick={() => api.mapHide()}><Icon name="x" size={16} /></button>
      </header>
      <MapPage embed onLink={href => api.site(href)} focus={focus} where={where} onWhere={findMe} shown={shown} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/mapa']}>
      <AuthProvider><MapWin /></AuthProvider>
    </MemoryRouter>
  </StrictMode>
);
