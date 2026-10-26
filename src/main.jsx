import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { isNativeShell } from './lib/install.js';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// The native Android wrapper loads the same assets from its own bundle. A
// service worker there would only risk serving stale files after an app update.
if (!isNativeShell() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', document.baseURI).href;
    navigator.serviceWorker.register(swUrl).catch((error) => {
      console.warn('[rakshacall] service worker could not be registered', error);
    });
  });
}
