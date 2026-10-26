import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Prices from './pages/Prices';
import Transport from './pages/Transport';
import Jobs from './pages/Jobs';
import MapPage from './pages/MapPage';
import Download from './pages/Download';
import NotFound from './pages/NotFound';
import Cabinet from './pages/cabinet/Cabinet';
import Wiki, { ToWiki } from './pages/Wiki';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="tsiny" element={<Prices />} />
        <Route path="iventy" element={<Navigate to="/" replace />} />
        <Route path="wiki" element={<Wiki />}>
          <Route index element={<Navigate to="roboty" replace />} />
          <Route path="roboty" element={<Jobs />} />
          <Route path="transport" element={<Transport />} />
        </Route>
        <Route path="transport" element={<ToWiki to="/wiki/transport" />} />
        <Route path="roboty" element={<ToWiki to="/wiki/roboty" />} />
        <Route path="mapa" element={<MapPage />} />
        <Route path="programa" element={<Download />} />
        <Route path="kabinet/*" element={<Cabinet />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
