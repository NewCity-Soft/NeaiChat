import CryptoJS from 'crypto-js';

// This is a simple encryption utility for local storage.
// In a real-world production app, sensitive keys should ideally 
// not be stored on the client side at all, or should be protected 
// by a user-provided master password.
const ENCRYPTION_KEY = 'harmony-chat-secure-v1';

export const encrypt = (text: string): string => {
  if (!text) return '';
  try {
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return text;
  }
};

export const decrypt = (ciphertext: string): string => {
  if (!ciphertext) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText && ciphertext) {
      // If decryption fails but there was a ciphertext, 
      // it might be that it wasn't encrypted yet (migration)
      return ciphertext;
    }
    return originalText;
  } catch (error) {
    // If decryption fails, it might be plain text from before encryption was implemented
    return ciphertext;
  }
};

export const getDecryptedItem = (key: string): string | null => {
  const item = localStorage.getItem(key);
  if (!item) return null;
  // Try to decrypt. If it fails or returns empty, it might be unencrypted.
  const decrypted = decrypt(item);
  return decrypted || item;
};
