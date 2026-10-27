import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import History from './History';
import '../styles.css';
import './bar.css';

/* окрема плашка історії програми Q-Hub (history.html → desktop/src/ui/history.html), ліворуч від плашки Alt+Q */
createRoot(document.getElementById('root')!).render(<StrictMode><History /></StrictMode>);
