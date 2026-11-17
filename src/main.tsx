import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './hooks/useStore';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

// Offline support: register the service worker in production builds only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      /* offline support is a progressive enhancement */
    });
  });
}
