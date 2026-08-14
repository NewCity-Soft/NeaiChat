import { useState, useEffect } from 'react';
import { encrypt, decrypt } from '../utils/encryption';

export function useLocalStorage<T>(key: string, initialValue: T, options?: { encrypt?: boolean }) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;
      
      const decryptedItem = options?.encrypt ? decrypt(item) : item;
      return decryptedItem ? JSON.parse(decryptedItem) : initialValue;
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const stringValue = JSON.stringify(storedValue);
      const encryptedValue = options?.encrypt ? encrypt(stringValue) : stringValue;
      window.localStorage.setItem(key, encryptedValue);
    } catch (error) {
      console.error(`Error saving localStorage key "${key}":`, error);
    }
  }, [key, storedValue, options?.encrypt]);

  return [storedValue, setStoredValue] as const;
}
