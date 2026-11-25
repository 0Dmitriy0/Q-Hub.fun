import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RuleWin from './RuleWin';
import './legacy.css';   // програма — на старому стилі сайту (див. legacy.css)
import './bar.css';

/* окреме вікно з правилом поверх гри (rule.html → desktop/src/ui/rule.html, specs/084) */
createRoot(document.getElementById('root')!).render(<StrictMode><RuleWin /></StrictMode>);
