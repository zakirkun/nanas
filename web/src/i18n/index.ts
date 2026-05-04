import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import id from './id.json';

export type SupportedLanguage = 'en' | 'id';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      id: { translation: id },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'id'],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'nanas.lang',
      caches: ['localStorage'],
    },
  });

export function setLanguage(lang: SupportedLanguage): void {
  void i18n.changeLanguage(lang);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', lang);
  }
}

export default i18n;
