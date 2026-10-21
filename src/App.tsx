import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Prices from './pages/Prices';
import Events from './pages/Events';
import Soon from './pages/Soon';
import Download from './pages/Download';
import NotFound from './pages/NotFound';
import Cabinet from './pages/cabinet/Cabinet';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="tsiny" element={<Prices />} />
        <Route path="iventy" element={<Events />} />
        <Route path="transport" element={<Soon page="transport" />} />
        <Route path="mapa" element={<Soon page="map" />} />
        <Route path="roboty" element={<Soon page="jobs" />} />
        <Route path="programa" element={<Download />} />
        <Route path="kabinet/*" element={<Cabinet />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
