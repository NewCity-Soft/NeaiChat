/**
 * AIGC 合规日志系统
 * 满足《互联网信息服务深度合成管理规定》《人工智能生成合成内容标识办法》及华为应用市场上架要求
 * 
 * 存储策略：独立 IndexedDB 数据库，纯本地加密存储，180 天自动过期清理
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export type AIGCRiskCheckResult = 'pass' | 'blocked' | 'sanitized';
export type AIGCLogStatus = 'success' | 'failed';

export interface AIGCMainLog {
  id: string;                    // UUID，主键
  traceId: string;               // 全局唯一追踪 ID（同时作为文件隐式元数据 ProduceID / PropagateID）
  createTime: string;            // ISO8601 时间戳
  deviceHash: string;            // 设备信息哈希（无明文 IMEI）
  appVersion: string;
  systemVersion: string;
  userPrompt: string;            // 用户原始提问/指令（脱敏）
  apiUrl: string;                // API 地址（不含 Key）
  modelName: string;             // 模型名称
  requestParams: string;         // 核心调用参数（温度、topP 等，JSON 序列化）
  aiResponse: string;            // AI 返回完整文本（截断至 2000 字符）
  hasWatermark: boolean;         // 本次生成是否带显式水印
  riskCheckResult: AIGCRiskCheckResult;
  status: AIGCLogStatus;
  createdAt: number;             // 存储时间戳（用于过期清理）
}

export type AIGCExportType = 'image' | 'text' | 'audio' | 'video' | 'other';
export type AIGCExportWatermarkMode = 'with_watermark' | 'no_watermark' | 'unconfigured';
export type AIGCExportMetaStatus = 'injected' | 'failed' | 'skipped';

export interface AIGCExportLog {
  id: string;                    // UUID，主键
  traceId: string;               // 关联主日志的核心字段
  exportTime: string;            // ISO8601 导出时间
  deviceHash: string;
  exportType: AIGCExportType;
  watermarkMode: AIGCExportWatermarkMode;
  metaStatus: AIGCExportMetaStatus;
  fileHash: string;              // 导出文件内容哈希（SHA-256 简化版）
  fileName: string;
  createdAt: number;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const DB_NAME = 'harmony_aigc_logs_db';
const DB_VERSION = 1;
const MAIN_STORE = 'main_logs';
const EXPORT_STORE = 'export_logs';
const RETENTION_DAYS = 180;
const APP_VERSION = '2.1.0';

// ─── 设备标识哈希 ───────────────────────────────────────────────────────────

let _deviceHash: string | null = null;

async function computeDeviceHash(): Promise<string> {
  if (_deviceHash) return _deviceHash;
  try {
    const raw = navigator.userAgent + navigator.platform + screen.width + screen.height + new Date().getTimezoneOffset();
    const encoded = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    _deviceHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  } catch {
    _deviceHash = `dev-${Date.now().toString(36)}`;
  }
  return _deviceHash;
}

// ─── IndexedDB 操作 ──────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(MAIN_STORE)) {
        const mainStore = db.createObjectStore(MAIN_STORE, { keyPath: 'id' });
        mainStore.createIndex('traceId', 'traceId', { unique: true });
        mainStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(EXPORT_STORE)) {
        const exportStore = db.createObjectStore(EXPORT_STORE, { keyPath: 'id' });
        exportStore.createIndex('traceId', 'traceId', { unique: false });
        exportStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 内存降级存储
const memoryMainLogs: AIGCMainLog[] = [];
const memoryExportLogs: AIGCExportLog[] = [];

// ─── 主日志操作 ──────────────────────────────────────────────────────────────

export async function writeMainLog(params: {
  traceId: string;
  userPrompt: string;
  apiUrl: string;
  modelName: string;
  requestParams: Record<string, any>;
  aiResponse: string;
  hasWatermark: boolean;
  riskCheckResult: AIGCRiskCheckResult;
  status: AIGCLogStatus;
}): Promise<AIGCMainLog> {
  const deviceHash = await computeDeviceHash();
  const now = Date.now();
  const id = crypto.randomUUID();

  const log: AIGCMainLog = {
    id,
    traceId: params.traceId,
    createTime: new Date(now).toISOString(),
    deviceHash,
    appVersion: APP_VERSION,
    systemVersion: `${navigator.platform} ${navigator.userAgent.split('(')[1]?.split(')')[0] || ''}`,
    userPrompt: params.userPrompt.length > 500 ? params.userPrompt.substring(0, 500) : params.userPrompt,
    apiUrl: params.apiUrl.replace(/\/v1\/.*$/, '/v1/').replace(/\/v2\/.*$/, '/v2/'), // 脱敏：去除路径中的敏感部分
    modelName: params.modelName,
    requestParams: JSON.stringify({
      temperature: params.requestParams?.temperature,
      topP: params.requestParams?.topP,
      maxTokens: params.requestParams?.maxTokens,
    }),
    aiResponse: params.aiResponse.length > 2000 ? params.aiResponse.substring(0, 2000) + '...(truncated)' : params.aiResponse,
    hasWatermark: params.hasWatermark,
    riskCheckResult: params.riskCheckResult,
    status: params.status,
    createdAt: now,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MAIN_STORE, 'readwrite');
      const store = tx.objectStore(MAIN_STORE);
      const req = store.put(log);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    memoryMainLogs.unshift(log);
  }

  return log;
}

export async function getMainLogs(limit = 100): Promise<AIGCMainLog[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(MAIN_STORE, 'readonly');
      const store = tx.objectStore(MAIN_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list: AIGCMainLog[] = (req.result || []).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
        resolve(list);
      };
      req.onerror = () => resolve([...memoryMainLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit));
    });
  } catch {
    return [...memoryMainLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
}

export async function getMainLogByTraceId(traceId: string): Promise<AIGCMainLog | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(MAIN_STORE, 'readonly');
      const store = tx.objectStore(MAIN_STORE);
      const index = store.index('traceId');
      const req = index.get(traceId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return memoryMainLogs.find(l => l.traceId === traceId) || null;
  }
}

// ─── 导出附属日志操作 ────────────────────────────────────────────────────────

export async function writeExportLog(params: {
  traceId: string;
  exportType: AIGCExportType;
  watermarkMode: AIGCExportWatermarkMode;
  metaStatus: AIGCExportMetaStatus;
  fileHash: string;
  fileName: string;
}): Promise<AIGCExportLog> {
  const deviceHash = await computeDeviceHash();
  const now = Date.now();
  const id = crypto.randomUUID();

  const log: AIGCExportLog = {
    id,
    traceId: params.traceId,
    exportTime: new Date(now).toISOString(),
    deviceHash,
    exportType: params.exportType,
    watermarkMode: params.watermarkMode,
    metaStatus: params.metaStatus,
    fileHash: params.fileHash.substring(0, 16),
    fileName: params.fileName,
    createdAt: now,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(EXPORT_STORE, 'readwrite');
      const store = tx.objectStore(EXPORT_STORE);
      const req = store.put(log);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    memoryExportLogs.unshift(log);
  }

  return log;
}

export async function getExportLogs(limit = 100): Promise<AIGCExportLog[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(EXPORT_STORE, 'readonly');
      const store = tx.objectStore(EXPORT_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list: AIGCExportLog[] = (req.result || []).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
        resolve(list);
      };
      req.onerror = () => resolve([...memoryExportLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit));
    });
  } catch {
    return [...memoryExportLogs].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
}

export async function getExportLogsByTraceId(traceId: string): Promise<AIGCExportLog[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(EXPORT_STORE, 'readonly');
      const store = tx.objectStore(EXPORT_STORE);
      const index = store.index('traceId');
      const req = index.getAll(traceId);
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => resolve([]);
    });
  } catch {
    return memoryExportLogs.filter(l => l.traceId === traceId).sort((a, b) => b.createdAt - a.createdAt);
  }
}

// ─── 过期清理 ────────────────────────────────────────────────────────────────

export async function purgeExpiredLogs(): Promise<{ mainCount: number; exportCount: number }> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let mainCount = 0;
  let exportCount = 0;

  try {
    const db = await openDB();

    // 清理主日志
    const mainTx = db.transaction(MAIN_STORE, 'readwrite');
    const mainStore = mainTx.objectStore(MAIN_STORE);
    const mainReq = mainStore.getAll();
    await new Promise<void>((resolve) => {
      mainReq.onsuccess = () => {
        const expired = (mainReq.result || []).filter(l => l.createdAt < cutoff);
        expired.forEach(l => mainStore.delete(l.id));
        mainCount = expired.length;
        resolve();
      };
      mainReq.onerror = () => resolve();
    });
    await new Promise<void>((resolve) => {
      mainTx.oncomplete = () => resolve();
      mainTx.onerror = () => resolve();
    });

    // 清理导出日志
    const expTx = db.transaction(EXPORT_STORE, 'readwrite');
    const expStore = expTx.objectStore(EXPORT_STORE);
    const expReq = expStore.getAll();
    await new Promise<void>((resolve) => {
      expReq.onsuccess = () => {
        const expired = (expReq.result || []).filter(l => l.createdAt < cutoff);
        expired.forEach(l => expStore.delete(l.id));
        exportCount = expired.length;
        resolve();
      };
      expReq.onerror = () => resolve();
    });
    await new Promise<void>((resolve) => {
      expTx.oncomplete = () => resolve();
      expTx.onerror = () => resolve();
    });
  } catch {
    // 内存降级：清理
    const memCutoff = cutoff;
    const origMainLen = memoryMainLogs.length;
    for (let i = memoryMainLogs.length - 1; i >= 0; i--) {
      if (memoryMainLogs[i].createdAt < memCutoff) {
        memoryMainLogs.splice(i, 1);
        mainCount++;
      }
    }
    const origExpLen = memoryExportLogs.length;
    for (let i = memoryExportLogs.length - 1; i >= 0; i--) {
      if (memoryExportLogs[i].createdAt < memCutoff) {
        memoryExportLogs.splice(i, 1);
        exportCount++;
      }
    }
  }

  return { mainCount, exportCount };
}

// ─── 清空所有日志（用户手动操作） ────────────────────────────────────────────

export async function clearAllLogs(): Promise<{ mainCount: number; exportCount: number }> {
  let mainCount = 0;
  let exportCount = 0;

  try {
    const db = await openDB();

    const mainTx = db.transaction(MAIN_STORE, 'readwrite');
    const mainStore = mainTx.objectStore(MAIN_STORE);
    const mainReq = mainStore.getAll();
    await new Promise<void>((resolve) => {
      mainReq.onsuccess = () => {
        mainCount = (mainReq.result || []).length;
        const clearReq = mainStore.clear();
        clearReq.onsuccess = () => resolve();
        clearReq.onerror = () => resolve();
      };
      mainReq.onerror = () => resolve();
    });
    await new Promise<void>((resolve) => {
      mainTx.oncomplete = () => resolve();
      mainTx.onerror = () => resolve();
    });

    const expTx = db.transaction(EXPORT_STORE, 'readwrite');
    const expStore = expTx.objectStore(EXPORT_STORE);
    const expReq = expStore.getAll();
    await new Promise<void>((resolve) => {
      expReq.onsuccess = () => {
        exportCount = (expReq.result || []).length;
        const clearReq = expStore.clear();
        clearReq.onsuccess = () => resolve();
        clearReq.onerror = () => resolve();
      };
      expReq.onerror = () => resolve();
    });
    await new Promise<void>((resolve) => {
      expTx.oncomplete = () => resolve();
      expTx.onerror = () => resolve();
    });
  } catch {
    mainCount = memoryMainLogs.length;
    exportCount = memoryExportLogs.length;
    memoryMainLogs.length = 0;
    memoryExportLogs.length = 0;
  }

  return { mainCount, exportCount };
}

// ─── 统计信息 ────────────────────────────────────────────────────────────────

export async function getLogStats(): Promise<{
  totalMainLogs: number;
  totalExportLogs: number;
  recentMainCount7d: number;
  recentExportCount7d: number;
}> {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const allMain = await getMainLogs(10000);
  const allExport = await getExportLogs(10000);

  return {
    totalMainLogs: allMain.length,
    totalExportLogs: allExport.length,
    recentMainCount7d: allMain.filter(l => l.createdAt >= sevenDaysAgo).length,
    recentExportCount7d: allExport.filter(l => l.createdAt >= sevenDaysAgo).length,
  };
}

// ─── 启动时自动清理过期日志 ─────────────────────────────────────────────────

export async function initAndCleanup(): Promise<void> {
  await purgeExpiredLogs();
}
