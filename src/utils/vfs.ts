export interface VFSItem {
  id: string;
  path: string;
  name: string;
  type: string;
  size: number;
  content: string;
  isBase64?: boolean;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'harmony_vfs_db';
const DB_VERSION = 1;
const STORE_NAME = 'files';

type VFSListener = () => void;
const listeners: Set<VFSListener> = new Set();

export function subscribeVFSChange(listener: VFSListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyVFSChange() {
  listeners.forEach(fn => fn());
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('path', 'path', { unique: true });
        store.createIndex('name', 'name', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Memory fallback if IndexedDB fails or is disabled
let memoryStore: VFSItem[] = [];

export async function getVFSFiles(): Promise<VFSItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list: VFSItem[] = req.result || [];
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };
      req.onerror = () => resolve(memoryStore);
    });
  } catch (err) {
    return memoryStore;
  }
}

export async function getVFSFileByPath(pathOrName: string): Promise<VFSItem | null> {
  const cleanPath = pathOrName.trim().startsWith('/') ? pathOrName.trim() : `/${pathOrName.trim()}`;
  const rawName = pathOrName.trim().replace(/^\/+/, '');
  const files = await getVFSFiles();
  return files.find(f => f.path === cleanPath || f.name === rawName || f.path === rawName || f.id === pathOrName) || null;
}

export async function saveVFSFile(params: {
  id?: string;
  path: string;
  name: string;
  type: string;
  content: string;
  isBase64?: boolean;
  size?: number;
}): Promise<VFSItem> {
  let cleanPath = params.path.trim();
  if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
  const name = params.name || cleanPath.split('/').pop() || 'unnamed_file';
  
  const existing = await getVFSFileByPath(cleanPath);
  const now = Date.now();
  const calculatedSize = params.size !== undefined ? params.size : new Blob([params.content]).size;

  const item: VFSItem = {
    id: existing?.id || params.id || crypto.randomUUID(),
    path: cleanPath,
    name: name,
    type: params.type || 'text/plain',
    size: calculatedSize,
    content: params.content,
    isBase64: params.isBase64 ?? false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    const idx = memoryStore.findIndex(m => m.id === item.id || m.path === item.path);
    if (idx >= 0) memoryStore[idx] = item;
    else memoryStore.unshift(item);
  }

  notifyVFSChange();
  return item;
}

export async function deleteVFSFile(pathOrId: string): Promise<boolean> {
  const target = await getVFSFileByPath(pathOrId);
  if (!target) return false;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(target.id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    memoryStore = memoryStore.filter(m => m.id !== target.id && m.path !== target.path);
  }

  notifyVFSChange();
  return true;
}

export async function deleteVFSFiles(ids: string[]): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      ids.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    memoryStore = memoryStore.filter(m => !ids.includes(m.id));
  }
  notifyVFSChange();
}

export async function moveVFSFiles(ids: string[], newDirectory: string): Promise<void> {
  const files = await getVFSFiles();
  const cleanDir = newDirectory.trim().replace(/\/+$/, '');
  const dirPath = cleanDir.startsWith('/') ? cleanDir : `/${cleanDir}`;

  const updates = files
    .filter(f => ids.includes(f.id))
    .map(f => ({
      ...f,
      path: `${dirPath === '/' ? '' : dirPath}/${f.name}`,
      updatedAt: Date.now()
    }));

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      updates.forEach(u => store.put(u));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    updates.forEach(u => {
      const idx = memoryStore.findIndex(m => m.id === u.id);
      if (idx >= 0) memoryStore[idx] = u;
    });
  }
  notifyVFSChange();
}

export async function clearVFS(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    memoryStore = [];
  }
  notifyVFSChange();
}

// Helper: Convert File object to VFS File
export async function fileToVFS(file: File, targetPath?: string): Promise<VFSItem> {
  return new Promise((resolve, reject) => {
    const isText = file.type.startsWith('text/') || 
                   file.type.includes('json') || 
                   file.type.includes('xml') || 
                   file.type.includes('javascript') || 
                   file.type.includes('typescript') ||
                   file.type.includes('csv') ||
                   file.name.endsWith('.md') ||
                   file.name.endsWith('.txt') ||
                   file.name.endsWith('.py') ||
                   file.name.endsWith('.js') ||
                   file.name.endsWith('.ts') ||
                   file.name.endsWith('.json') ||
                   file.name.endsWith('.csv') ||
                   file.name.endsWith('.html') ||
                   file.name.endsWith('.css');

    const reader = new FileReader();
    if (isText) {
      reader.readAsText(file);
      reader.onload = async () => {
        const textContent = reader.result as string;
        const item = await saveVFSFile({
          path: targetPath || `/${file.name}`,
          name: file.name,
          type: file.type || 'text/plain',
          content: textContent,
          isBase64: false,
          size: file.size,
        });
        resolve(item);
      };
    } else {
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const item = await saveVFSFile({
          path: targetPath || `/${file.name}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          content: dataUrl,
          isBase64: true,
          size: file.size,
        });
        resolve(item);
      };
    }
    reader.onerror = (e) => reject(e);
  });
}


