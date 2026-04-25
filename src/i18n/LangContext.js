import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from './translations';

const LangContext = createContext();
const STORAGE_KEY = 'myshift_lang';

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'en';
    } catch { return 'en'; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    // Set HTML dir attribute for RTL support
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key, replacements = {}) => {
    const dict = translations[lang] || translations.en;
    let str = dict[key];
    if (str === undefined) str = translations.en[key] || key;
    if (typeof str === 'string') {
      Object.keys(replacements).forEach((k) => {
        str = str.replace(`{${k}}`, replacements[k]);
      });
    }
    return str;
  };

  const toggle = () => setLang((l) => (l === 'en' ? 'he' : 'en'));

  return (
    <LangContext.Provider value={{ lang, setLang, toggle, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
