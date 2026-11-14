import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RuleWin from './RuleWin';
import '../styles.css';
import './bar.css';

/* окреме вікно з правилом поверх гри (rule.html → desktop/src/ui/rule.html, specs/084) */
createRoot(document.getElementById('root')!).render(<StrictMode><RuleWin /></StrictMode>);
