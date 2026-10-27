import { Navigate, Route, Routes } from 'react-router-dom';
import Cabinet from '../pages/cabinet/Cabinet';
import StaticGate from '../components/StaticGate';
import UpdateBanner from './UpdateBanner';

/* головна плашки Alt+Q: кабінет (дашборд і розділи) під рядком пошуку.
   Висота — під екран (плашка не має вилазити за нього), прокручується всередині */
export default function Hub() {
  const h = Math.max(360, Math.min(700, window.screen.availHeight - 240));
  return (
    <div className="bhub" style={{ height: h }}>
      <Routes>
        <Route path="/kabinet/*" element={<Cabinet />} />
        <Route path="*" element={<Navigate to="/kabinet" replace />} />
      </Routes>
      <StaticGate />
      <UpdateBanner />
    </div>
  );
}
