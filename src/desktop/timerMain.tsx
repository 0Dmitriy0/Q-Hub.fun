import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Timer from './Timer';
import '../styles.css';
import './bar.css';

/* вікно таймера заробітку поверх гри (timer.html → desktop/src/ui/timer.html, specs/086) */
createRoot(document.getElementById('root')!).render(<StrictMode><Timer /></StrictMode>);
