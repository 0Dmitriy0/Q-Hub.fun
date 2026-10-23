import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Bar from './Bar';
import '../styles.css';
import './bar.css';

/* плашка Alt+Q програми Q-Hub (bar.html → desktop/src/ui/bar.html) */
createRoot(document.getElementById('root')!).render(<StrictMode><Bar /></StrictMode>);
