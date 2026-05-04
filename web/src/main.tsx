import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </React.StrictMode>,
);
