import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import Bar from './Bar';
import '../styles.css';
import './bar.css';

/* плашка Alt+Q програми Q-Hub (bar.html → desktop/src/ui/bar.html) — уся програма: рядок пошуку і кабінет під ним.
   Адреси кабінету живуть у пам'яті плашки (MemoryRouter): кнопки ‹ › ходять по них; сесію дає програма через міст */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/kabinet']}>
      <AuthProvider><Bar /></AuthProvider>
    </MemoryRouter>
  </StrictMode>
);
