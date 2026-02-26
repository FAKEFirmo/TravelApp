import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Offline/PWA service worker registration.
// Provided by vite-plugin-pwa.
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
