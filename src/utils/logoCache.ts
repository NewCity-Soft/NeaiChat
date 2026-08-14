import { cacheMedia } from './mediaCache';
import { useState, useEffect } from 'react';

const LOGO_CACHE_KEY = 'harmony_app_logo_data';
const DEFAULT_LOGO_PATH = '/logo.png';
const REMOTE_DEFAULT_LOGO = 'https://raw.githubusercontent.com/NewCity-Soft/NeaiChat/main/public/logo.png';

let currentLogoUrl = typeof window !== 'undefined' ? (localStorage.getItem(LOGO_CACHE_KEY) || DEFAULT_LOGO_PATH) : DEFAULT_LOGO_PATH;
const listeners = new Set<(url: string) => void>();

export function getAppLogoSync(): string {
  return currentLogoUrl;
}

export function subscribeLogo(listener: (url: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyLogoChange(newUrl: string) {
  currentLogoUrl = newUrl;
  listeners.forEach((l) => l(newUrl));
}

export async function setAppLogo(urlOrBase64: string) {
  try {
    localStorage.setItem(LOGO_CACHE_KEY, urlOrBase64);
    notifyLogoChange(urlOrBase64);
    if (urlOrBase64.startsWith('http://') || urlOrBase64.startsWith('https://')) {
      const cached = await cacheMedia(urlOrBase64);
      if (cached) {
        localStorage.setItem(LOGO_CACHE_KEY, cached);
        notifyLogoChange(cached);
      }
    }
  } catch (e) {
    console.warn('Set app logo error:', e);
  }
}

export async function resetAppLogo() {
  try {
    localStorage.removeItem(LOGO_CACHE_KEY);
    notifyLogoChange(DEFAULT_LOGO_PATH);
    initAppLogoCache();
  } catch (e) {
    console.warn('Reset app logo error:', e);
  }
}

export async function initAppLogoCache() {
  const stored = localStorage.getItem(LOGO_CACHE_KEY);
  if (stored) {
    currentLogoUrl = stored;
    notifyLogoChange(stored);
    return stored;
  }

  // Try caching local /logo.png first
  try {
    const cached = await cacheMedia(DEFAULT_LOGO_PATH);
    if (cached && cached !== DEFAULT_LOGO_PATH) {
      localStorage.setItem(LOGO_CACHE_KEY, cached);
      notifyLogoChange(cached);
      return cached;
    }
  } catch {
    // fallback to remote logo
  }

  try {
    const cachedRemote = await cacheMedia(REMOTE_DEFAULT_LOGO);
    if (cachedRemote) {
      localStorage.setItem(LOGO_CACHE_KEY, cachedRemote);
      notifyLogoChange(cachedRemote);
      return cachedRemote;
    }
  } catch {
    // fallback
  }

  return DEFAULT_LOGO_PATH;
}

export function useAppLogo() {
  const [logoUrl, setLogoUrl] = useState<string>(getAppLogoSync());

  useEffect(() => {
    const unsubscribe = subscribeLogo((url) => {
      setLogoUrl(url);
    });
    // Trigger async cache check if needed
    initAppLogoCache();
    return unsubscribe;
  }, []);

  return {
    logoUrl,
    setLogoUrl: (url: string) => setAppLogo(url),
    resetLogo: () => resetAppLogo(),
  };
}
