import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Timer from './Timer';
import './legacy.css';   // програма — на старому стилі сайту (див. legacy.css)
import './bar.css';

/* вікно таймера заробітку поверх гри (timer.html → desktop/src/ui/timer.html, specs/086) */
createRoot(document.getElementById('root')!).render(<StrictMode><Timer /></StrictMode>);
