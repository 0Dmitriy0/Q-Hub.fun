import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import Cabinet from '../pages/cabinet/Cabinet';
import StaticGate from '../components/StaticGate';
import '../styles.css';

/* Інтерфейс програми Q-Hub: лише кабінет, вбудований у саму програму (desktop/src/ui), а не сторінка сайту.
   Збирається vite.app.config.ts; дані — з тієї ж бази, сесію дає програма через міст (src/lib/app.ts). */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="kabinet/*" element={<Cabinet />} />
          <Route path="*" element={<Navigate to="/kabinet" replace />} />
        </Routes>
        <StaticGate />
      </AuthProvider>
    </HashRouter>
  </StrictMode>
);
