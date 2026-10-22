import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Prices from './pages/Prices';
import Soon from './pages/Soon';
import Transport from './pages/Transport';
import Jobs from './pages/Jobs';
import Download from './pages/Download';
import NotFound from './pages/NotFound';
import Cabinet from './pages/cabinet/Cabinet';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="tsiny" element={<Prices />} />
        <Route path="iventy" element={<Navigate to="/" replace />} />
        <Route path="transport" element={<Transport />} />
        <Route path="mapa" element={<Soon page="map" />} />
        <Route path="roboty" element={<Jobs />} />
        <Route path="programa" element={<Download />} />
        <Route path="kabinet/*" element={<Cabinet />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
