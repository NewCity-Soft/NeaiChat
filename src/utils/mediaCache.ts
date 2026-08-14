/**
 * 媒体文件自动缓存与持久化服务 (IndexedDB)
 * 用于自动缓存 AI 生成的图片、视频、语音等媒体，防止远程 URL 失效或下载报错
 */

const DB_NAME = 'harmony-media-cache';
const DB_VERSION = 1;
const STORE_NAME = 'media_files';

interface CachedMediaItem {
  url: string;          // 原始 URL 或标识
  blob: Blob;           // 缓存的二进制 Blob
  mimeType: string;     // 媒体 MIME 类型
  timestamp: number;    // 缓存时间戳
  dataUrl?: string;     // 可选 Base64 Data URL (较小文件)
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * 将 Blob 转换成 Base64 Data URL
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 缓存媒体文件到 IndexedDB，并返回可持续访问的 URL (Data URL 或 Blob URL)
 */
export async function cacheMedia(url: string, defaultMimeType = 'image/png'): Promise<string> {
  if (!url || typeof url !== 'string') return url;
  
  // 如果已经是 Data URL，可直接存为 Blob
  if (url.startsWith('data:')) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      await saveToIndexedDB(url, blob, blob.type || defaultMimeType);
      return url;
    } catch {
      return url;
    }
  }

  // 先尝试从 IndexedDB 查找已有缓存
  try {
    const cached = await getFromIndexedDB(url);
    if (cached) {
      if (cached.dataUrl) return cached.dataUrl;
      return URL.createObjectURL(cached.blob);
    }
  } catch (e) {
    console.warn('Read IndexedDB error:', e);
  }

  // 如果是 HTTP/HTTPS 网络地址，通过 fetch 抓取并写入缓存
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
    try {
      let response: Response | null = null;
      try {
        response = await fetch(url, { mode: 'cors' });
        if (!response.ok) response = null;
      } catch {
        response = null;
      }

      // 如果跨域直接 fetch 失败（CORS 报错），尝试使用代理抓取
      if (!response) {
        try {
          const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(url)}`;
          let proxyRes = await fetch(proxyUrl);
          if (!proxyRes.ok) {
             const publicProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
             proxyRes = await fetch(publicProxyUrl);
          }
          if (proxyRes.ok) response = proxyRes;
        } catch {
          try {
             const publicProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
             const publicRes = await fetch(publicProxyUrl);
             if (publicRes.ok) response = publicRes;
          } catch {
             response = null;
          }
        }
      }

      if (response && response.ok) {
        const blob = await response.blob();
        const mimeType = response.headers.get('content-type') || blob.type || defaultMimeType;
        
        // 对于较小图片 (< 5MB)，生成 Data URL 以便在 LocalStorage / JSON 导出中永久保持可用
        let dataUrl: string | undefined;
        if (blob.size < 5 * 1024 * 1024) {
          try {
            dataUrl = await blobToDataUrl(blob);
          } catch {
            // ignore
          }
        }

        await saveToIndexedDB(url, blob, mimeType, dataUrl);
        
        if (dataUrl) return dataUrl;
        return URL.createObjectURL(blob);
      }
    } catch (err) {
      console.warn('Failed to cache media from url:', url, err);
    }
  }

  return url;
}

/**
 * 从 IndexedDB 中读取缓存
 */
export async function getFromIndexedDB(url: string): Promise<CachedMediaItem | null> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(url);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * 存储项到 IndexedDB
 */
export async function saveToIndexedDB(url: string, blob: Blob, mimeType: string, dataUrl?: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const item: CachedMediaItem = {
        url,
        blob,
        mimeType,
        timestamp: Date.now(),
        dataUrl,
      };
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Save to IndexedDB error:', e);
  }
}

/**
 * 获取媒体文件的完整 Blob 数据（优先读取本地缓存，否则 fetch 远程）
 */
export async function fetchMediaBlob(urlOrBlob: string | Blob | ArrayBuffer): Promise<{ blob: Blob; mimeType: string }> {
  if (urlOrBlob instanceof Blob) {
    return { blob: urlOrBlob, mimeType: urlOrBlob.type || 'application/octet-stream' };
  }

  if (urlOrBlob instanceof ArrayBuffer) {
    const blob = new Blob([urlOrBlob], { type: 'application/octet-stream' });
    return { blob, mimeType: 'application/octet-stream' };
  }

  const url = String(urlOrBlob);

  // Data URL 处理
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);/);
    const mimeType = match ? match[1] : 'application/octet-stream';
    const res = await fetch(url);
    const blob = await res.blob();
    return { blob, mimeType };
  }

  // 查本地 IndexedDB
  const cached = await getFromIndexedDB(url);
  if (cached && cached.blob) {
    return { blob: cached.blob, mimeType: cached.mimeType || 'application/octet-stream' };
  }

  // 网络 fetch 兜底
  try {
    let response: Response | null = null;
    try {
      response = await fetch(url);
      if (!response.ok) response = null;
    } catch {
      response = null;
    }

    if (!response) {
      try {
        const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(url)}`;
        let proxyRes = await fetch(proxyUrl);
        if (!proxyRes.ok) {
          const publicProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
          proxyRes = await fetch(publicProxyUrl);
        }
        if (proxyRes.ok) response = proxyRes;
      } catch {
        try {
           const publicProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
           const publicRes = await fetch(publicProxyUrl);
           if (publicRes.ok) response = publicRes;
        } catch {
           response = null;
        }
      }
    }

    if (response && response.ok) {
      const blob = await response.blob();
      const mimeType = response.headers.get('content-type') || blob.type || 'application/octet-stream';
      // 顺便保存到 IndexedDB 供后续反复使用
      saveToIndexedDB(url, blob, mimeType).catch(() => {});
      return { blob, mimeType };
    }
  } catch (e) {
    console.warn('Fetch media blob failed:', url, e);
  }

  // 抛出异常由调用方处理
  throw new Error(`Unable to fetch blob for url: ${url}`);
}
