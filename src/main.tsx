import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for offline PWA functionality with auto-update
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegistered(r) {
      console.info('[PWA Service Worker] Registered successfully:', r?.scope);
    },
    onRegisterError(error) {
      console.warn('[PWA Service Worker] Registration notice:', error);
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);

