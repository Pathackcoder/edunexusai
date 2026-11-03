import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AppearanceProvider } from './context/AppearanceContext';
import './index.css';

// Register PWA Service Worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Service worker registered successfully
      })
      .catch((error) => {
        console.warn('[PWA] Service worker registration failed:', error);
      });
  });
}

// Old development workers could mix cached React modules from different Vite builds.
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
    registrations.filter((registration) => registration.active?.scriptURL === `${window.location.origin}/sw.js`).map((registration) => registration.unregister()),
  ));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Institution-controlled theme and typography (Admin → Portal appearance). */}
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  </React.StrictMode>,
);
