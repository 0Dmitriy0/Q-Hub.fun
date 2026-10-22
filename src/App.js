import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
export default function App() {
    return (_jsx(Routes, { children: _jsxs(Route, { element: _jsx(Layout, {}), children: [_jsx(Route, { index: true, element: _jsx(Home, {}) }), _jsx(Route, { path: "tsiny", element: _jsx(Prices, {}) }), _jsx(Route, { path: "iventy", element: _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "transport", element: _jsx(Transport, {}) }), _jsx(Route, { path: "mapa", element: _jsx(MapPage, {}) }), _jsx(Route, { path: "roboty", element: _jsx(Jobs, {}) }), _jsx(Route, { path: "programa", element: _jsx(Download, {}) }), _jsx(Route, { path: "kabinet/*", element: _jsx(Cabinet, {}) }), _jsx(Route, { path: "*", element: _jsx(NotFound, {}) })] }) }));
}
