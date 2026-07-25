import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyDlsTokens } from '@drkyana/types';
import { App } from './App';
import { I18nProvider } from './i18n/I18nProvider';
import { RouterProvider } from './router';
import './index.css';

// Source the @theme brand/accent/neutral colors from the DLS at runtime —
// see the comment in index.css's @theme block.
applyDlsTokens();

document.body.classList.add('is-loading');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <RouterProvider>
        <App />
      </RouterProvider>
    </I18nProvider>
  </StrictMode>,
);
