import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LangProvider } from './i18n/LangContext';
import { ThemeProvider } from './lib/theme';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <LangProvider>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </LangProvider>
);
