import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import MapPage from '../pages/MapPage';
import Icon from '../components/Icon';
import '../styles.css';
import './bar.css';

/* мапа Q-Hub поверх гри (map.html → desktop/src/ui/map.html, specs/014): та сама сторінка мапи, що на сайті, лише перегляд.
   Плашка в стилі «Історії»: шапка з назвою, клавішею й хрестиком; Esc чи клавіша мапи ховають її, фокус — назад у гру */
interface MapApi { mapHide(): Promise<void>; mapKey(): Promise<string | null>; site(path: string): Promise<void> }
const api = (window as unknown as { qhub: MapApi }).qhub;

function MapWin() {
  const [key, setKey] = useState('');
  useEffect(() => { api.mapKey().then(k => setKey(k || '')); }, []);
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
      <MapPage embed onLink={href => api.site(href)} />
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
