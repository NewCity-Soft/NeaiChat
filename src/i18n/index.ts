import { useState, useEffect } from 'react';
import defaultCsvText from '../locales.csv?raw';

export type Language = 'zh-CN' | 'en-US' | 'ja-JP';

const LANG_STORAGE_KEY = 'harmony_language';

type TranslationsMap = Record<string, Record<Language, string>>;

function parseCsvRow(rowStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csv: string): TranslationsMap {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return {};

  const headers = lines[0].split(',').map((h) => h.trim()) as (keyof TranslationsMap[string] | 'key')[];
  const langIndices: Partial<Record<Language, number>> = {};

  headers.forEach((h, idx) => {
    if (h === 'zh-CN' || h === 'en-US' || h === 'ja-JP') {
      langIndices[h as Language] = idx;
    }
  });

  const map: TranslationsMap = {};

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    if (!row || row.length === 0) continue;
    const key = row[0]?.trim();
    if (!key) continue;

    map[key] = {
      'zh-CN': row[langIndices['zh-CN'] ?? 1] || '',
      'en-US': row[langIndices['en-US'] ?? 2] || '',
      'ja-JP': row[langIndices['ja-JP'] ?? 3] || '',
    };
  }

  return map;
}

let translationsStore: TranslationsMap = parseCSV(defaultCsvText);
let currentLang: Language = (typeof window !== 'undefined' ? (localStorage.getItem(LANG_STORAGE_KEY) as Language) : null) || 'zh-CN';
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return currentLang;
}

export function setLanguage(lang: Language) {
  currentLang = lang;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }
  listeners.forEach((fn) => fn());
}

export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function t(key: string, fallback?: string, params?: Record<string, string | number>): string {
  const translationObj = translationsStore[key];
  let text = translationObj?.[currentLang] || translationObj?.['zh-CN'] || fallback || key;

  if (params) {
    Object.entries(params).forEach(([pKey, pVal]) => {
      text = text.replace(new RegExp(`\\{\\{${pKey}\\}\\}`, 'g'), String(pVal));
    });
  }

  return text;
}



export function useTranslation() {
  const [lang, setLangState] = useState<Language>(getLanguage());

  useEffect(() => {
    const unsubscribe = subscribeLanguage(() => {
      setLangState(getLanguage());
    });
    return unsubscribe;
  }, []);

  return {
    t: (key: string, fallback?: string, params?: Record<string, string | number>) => t(key, fallback, params),
    language: lang,
    setLanguage: (newLang: Language) => setLanguage(newLang),
  };
}
