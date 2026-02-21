import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import pt from './locales/pt';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';

const resources = {
  pt: { translation: pt },
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'pt',
    fallbackLng: 'pt',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

export default i18n;

export const changeLanguage = (lang: string) => {
  i18n.changeLanguage(lang);
};

export const getCurrentLanguage = () => i18n.language;

export const supportedLanguages = [
  { code: 'pt', name: 'Português' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
];
