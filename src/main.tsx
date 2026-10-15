import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/source-sans-3';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import '@fontsource-variable/jetbrains-mono';

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
