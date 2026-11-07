import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en';
import ar from './ar';
import fr from './fr';

const DICTS = { en, ar, fr };
export const LANGS = ['en', 'ar', 'fr'];
const KEY = 'aismp_lang';
// Western digits in Arabic too, as on most Lebanese sites (matches IDs and phone numbers)
const LOCALES = { en: 'en-GB', ar: 'ar-LB-u-nu-latn', fr: 'fr-FR' };

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  const nav = (navigator.language || 'en').slice(0, 2);
  return LANGS.includes(nav) ? nav : 'en';
}

const lookup = (dict, key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), dict);

const I18nCtx = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  const setLang = useCallback((l) => {
    if (!LANGS.includes(l)) return;
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const value = useMemo(() => {
    const t = (key, params) => {
      let s = lookup(DICTS[lang], key) ?? lookup(en, key) ?? key;
      if (params && typeof s === 'string') {
        s = s.replace(/\{(\w+)\}/g, (_, p) => (params[p] ?? `{${p}}`));
      }
      return s;
    };
    const locale = LOCALES[lang];
    const fmtDate = (d, withTime = false) => {
      if (!d) return '';
      return new Intl.DateTimeFormat(locale, withTime
        ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
    };
    const fmtNum = (n) => (n == null ? '–' : new Intl.NumberFormat(locale).format(n));
    return { lang, setLang, t, fmtDate, fmtNum, dir: lang === 'ar' ? 'rtl' : 'ltr' };
  }, [lang, setLang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
