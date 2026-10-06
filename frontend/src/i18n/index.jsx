import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { profileApi } from '../services/api';
import es from './locales/es';
import fr from './locales/fr';
import hi from './locales/hi';

/**
 * Translation foundation.
 *
 * gettext-style: the English source string is the key, so `t('Dashboard')` works
 * without a parallel key file and an untranslated string simply falls back to
 * English. Dictionaries currently cover navigation and shared chrome; page copy can
 * be wrapped in `t()` incrementally. The chosen language is saved on the user record
 * (users.locale) and mirrored to localStorage for the sign-in screen.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
];
const DICTIONARIES = { en: {}, es, fr, hi };
const STORAGE_KEY = 'edunexus.locale';

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const I18nContext = createContext({ locale: 'en', t: (text) => text, setLocale: () => {}, languages: LANGUAGES });

export function I18nProvider({ children }) {
  const { user, refreshUser } = useAuth();
  const [locale, setLocaleState] = useState(() => readStored() || 'en');

  // The account's saved language wins once the user is known.
  useEffect(() => {
    if (user?.locale && DICTIONARIES[user.locale]) setLocaleState(user.locale);
  }, [user?.locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* private mode */
    }
  }, [locale]);

  const setLocale = useCallback(
    async (next) => {
      if (!DICTIONARIES[next]) return;
      setLocaleState(next);
      if (user) {
        try {
          await profileApi.update({ locale: next });
          refreshUser?.();
        } catch {
          /* the UI language still changes for this session */
        }
      }
    },
    [user, refreshUser],
  );

  const value = useMemo(() => {
    const dictionary = DICTIONARIES[locale] ?? {};
    return {
      locale,
      languages: LANGUAGES,
      setLocale,
      t: (text) => (typeof text === 'string' ? dictionary[text] ?? text : text),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
