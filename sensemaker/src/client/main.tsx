import { createRoot } from 'react-dom/client';
import { initFaro } from './observability';
import App from './App';
import './index.css';

// Initialize Faro for frontend observability (before React renders)
initFaro();

createRoot(document.getElementById('root')!).render(<App />);
