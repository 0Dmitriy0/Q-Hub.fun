import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Wiki, { ToWiki } from './pages/Wiki';

/* головна — одразу; решта сторінок — окремими файлами, лише коли їх відкрили (менше коду на першому відкритті сайту) */
const Prices = lazy(() => import('./pages/Prices'));
const Transport = lazy(() => import('./pages/Transport'));
const Jobs = lazy(() => import('./pages/Jobs'));
const WikiEvents = lazy(() => import('./pages/WikiEvents'));
const WikiEvent = lazy(() => import('./pages/WikiEvent'));
const MapPage = lazy(() => import('./pages/MapPage'));
const GameMapGuide = lazy(() => import('./pages/GameMapGuide'));
const Download = lazy(() => import('./pages/Download'));
const AppGuide = lazy(() => import('./pages/AppGuide'));
const Cabinet = lazy(() => import('./pages/cabinet/Cabinet'));
const RulesAdmin = lazy(() => import('./pages/RulesAdmin'));
const Admin = lazy(() => import('./pages/Admin'));
const Panel = lazy(() => import('./pages/Panel'));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="tsiny" element={<Prices />} />
        <Route path="iventy" element={<ToWiki to="/wiki/iventy" />} />
        <Route path="wiki" element={<Wiki />}>
          <Route index element={<Navigate to="roboty" replace />} />
          <Route path="roboty" element={<Jobs />} />
          <Route path="transport" element={<Transport />} />
          <Route path="iventy" element={<WikiEvents />} />
          <Route path="iventy/:slug" element={<WikiEvent />} />
        </Route>
        <Route path="transport" element={<ToWiki to="/wiki/transport" />} />
        <Route path="roboty" element={<ToWiki to="/wiki/roboty" />} />
        <Route path="mapa" element={<MapPage />} />
        <Route path="mapa/v-gru" element={<GameMapGuide />} />
        <Route path="programa" element={<Download />} />
        <Route path="programa/instruktsiya" element={<AppGuide />} />
        <Route path="kabinet/*" element={<Cabinet />} />
        <Route path="admin" element={<Admin />} />
        <Route path="admin/pravyla" element={<RulesAdmin />} />
        <Route path="panel/*" element={<Panel />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
