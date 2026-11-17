import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './hooks/useStore';
import { SyncProvider } from './hooks/useSync';
import { WeatherProvider } from './hooks/useWeather';
// Fonts are bundled with the app (no Google Fonts request), so they work offline from the first launch.
import '@fontsource/anton/400.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <SyncProvider>
        <WeatherProvider>
          <App />
        </WeatherProvider>
      </SyncProvider>
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
