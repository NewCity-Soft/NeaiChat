/**
 * 华为 HarmonyOS 7 AIGC 文件元数据隐式标识规范实现
 * 
 * 强制五要素：
 * 1. Label: "1" (AI生成合成内容)
 * 2. ContentProducer: 用户 API 顶级域名地址 (例如 openai.com, deepseek.com)
 * 3. ProduceID: UUID
 * 4. ContentPropagator: "NeaiChat"
 * 5. PropagateID: 与 ProduceID 一致
 */

import { getDecryptedItem } from './encryption';

export interface AIGCMetadata {
  Label: string;
  ContentProducer: string;
  ProduceID: string;
  ContentPropagator: string;
  PropagateID: string;
}

export const APP_PROPAGATOR_NAME = 'NeaiChat';

/**
 * 从 API URL 中提取顶级域名
 */
export function extractTopLevelDomain(apiUrl?: string): string {
  let targetUrl = apiUrl;
  if (!targetUrl && typeof window !== 'undefined') {
    try {
      const savedSettings = getDecryptedItem('harmony-settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        targetUrl = parsed.apiUrl;
      }
    } catch {
      // ignore
    }
  }

  if (!targetUrl || targetUrl.trim() === '') {
    targetUrl = 'https://api.openai.com/v1';
  }

  try {
    const cleanUrl = targetUrl.trim().startsWith('http') ? targetUrl.trim() : `https://${targetUrl.trim()}`;
    const hostname = new URL(cleanUrl).hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname || 'openai.com';
  } catch {
    return 'openai.com';
  }
}

/**
 * 生成符合规范的 AIGC 五要素隐式元数据
 */
export function createAIGCMetadata(customId?: string, apiUrl?: string): AIGCMetadata {
  const id = customId || (typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : `aigc-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`);
  
  const producerDomain = extractTopLevelDomain(apiUrl);

  return {
    Label: "1",
    ContentProducer: producerDomain,
    ProduceID: id,
    ContentPropagator: APP_PROPAGATOR_NAME,
    PropagateID: id,
  };
}

/**
 * 生成 XMP 标准 XML 描述块
 */
export function generateXMPPacket(metadata: AIGCMetadata): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:aigc="http://ns.huawei.com/aigc/1.0/">
      <aigc:Label>${metadata.Label}</aigc:Label>
      <aigc:ContentProducer>${metadata.ContentProducer}</aigc:ContentProducer>
      <aigc:ProduceID>${metadata.ProduceID}</aigc:ProduceID>
      <aigc:ContentPropagator>${metadata.ContentPropagator}</aigc:ContentPropagator>
      <aigc:PropagateID>${metadata.PropagateID}</aigc:PropagateID>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * CRC32 计算表与算法 (PNG Chunk CRC)
 */
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function calculateCRC32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 将 AIGC 元数据注入 PNG 图片二进制 ArrayBuffer (标准 PNG tEXt Chunk)
 */
export function injectAIGCToPngBuffer(arrayBuffer: ArrayBuffer, metadata: AIGCMetadata): ArrayBuffer {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    // PNG Magic Header: 89 50 4E 47 0D 0A 1A 0A
    if (bytes.length < 33 ||
        bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47 ||
        bytes[4] !== 0x0D || bytes[5] !== 0x0A || bytes[6] !== 0x1A || bytes[7] !== 0x0A) {
      return arrayBuffer; // 不是有效的 PNG Header Signature，原样返回
    }

    // 构造 tEXt Chunk 内容
    const keyword = "AIGC";
    const jsonValue = JSON.stringify(metadata);
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(keyword);
    const valBytes = encoder.encode(jsonValue);
    
    // Data: key + \0 + val
    const chunkData = new Uint8Array(keyBytes.length + 1 + valBytes.length);
    chunkData.set(keyBytes, 0);
    chunkData[keyBytes.length] = 0; // null separator
    chunkData.set(valBytes, keyBytes.length + 1);

    // Type: "tEXt"
    const chunkType = new Uint8Array([0x74, 0x45, 0x58, 0x74]);

    // CRC calculate over Type + Data
    const typeAndData = new Uint8Array(chunkType.length + chunkData.length);
    typeAndData.set(chunkType, 0);
    typeAndData.set(chunkData, chunkType.length);
    const crcValue = calculateCRC32(typeAndData);

    // Chunk total bytes: 4 (length) + 4 (type) + data.length + 4 (crc)
    const chunkLength = chunkData.length;
    const totalChunkBytes = new Uint8Array(12 + chunkLength);
    const view = new DataView(totalChunkBytes.buffer);
    
    view.setUint32(0, chunkLength, false); // Big endian
    totalChunkBytes.set(chunkType, 4);
    totalChunkBytes.set(chunkData, 8);
    view.setUint32(8 + chunkLength, crcValue, false);

    // 校验并移除旧的 AIGC Chunk
    const chunks: { offset: number; length: number; type: string }[] = [];
    let offset = 8; // skip PNG signature
    const dataView = new DataView(arrayBuffer);

    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) break;
      const len = dataView.getUint32(offset, false);
      if (offset + 12 + len > bytes.length) {
        // 数据结构非标准或损坏，直接返回原 Buffer 保证图片可读
        return arrayBuffer;
      }

      const typeStr = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      
      let isOldAigcChunk = false;
      if (typeStr === 'tEXt') {
        const textData = bytes.subarray(offset + 8, offset + 8 + len);
        const textStr = new TextDecoder().decode(textData);
        if (textStr.startsWith('AIGC') || textStr.includes('ProduceID')) {
          isOldAigcChunk = true;
        }
      }

      if (!isOldAigcChunk) {
        chunks.push({ offset, length: 12 + len, type: typeStr });
      }
      offset += 12 + len;
    }

    // 计算重建后的 Uint8Array 大小
    let newSize = 8 + totalChunkBytes.length;
    for (const c of chunks) {
      newSize += c.length;
    }

    const result = new Uint8Array(newSize);
    result.set(bytes.subarray(0, 8), 0); // PNG Signature

    let writeOffset = 8;
    let inserted = false;

    for (const c of chunks) {
      result.set(bytes.subarray(c.offset, c.offset + c.length), writeOffset);
      writeOffset += c.length;

      // 紧跟 IHDR 块插入新的 AIGC Chunk
      if (c.type === 'IHDR' && !inserted) {
        result.set(totalChunkBytes, writeOffset);
        writeOffset += totalChunkBytes.length;
        inserted = true;
      }
    }

    if (!inserted) {
      return arrayBuffer;
    }

    return result.buffer;
  } catch (e) {
    console.warn('PNG AIGC Metadata injection error, fallback to original buffer:', e);
    return arrayBuffer;
  }
}

/**
 * 注入 SVG 文件的 <metadata> 块
 */
export function injectAIGCToSvg(svgContent: string, metadata: AIGCMetadata): string {
  // 清理已有 aigc:meta / AIGC_METADATA 以遵守唯一性规则
  let cleanedSvg = svgContent.replace(/<metadata>[\s\S]*?<\/metadata>/gi, '');
  
  const metaTag = `<metadata><aigc:meta Label="${metadata.Label}" ContentProducer="${metadata.ContentProducer}" ProduceID="${metadata.ProduceID}" ContentPropagator="${metadata.ContentPropagator}" PropagateID="${metadata.PropagateID}" /></metadata>`;
  
  if (cleanedSvg.includes('<svg')) {
    return cleanedSvg.replace(/<svg([^>]*)>/i, `<svg$1>\n${metaTag}`);
  }
  return metaTag + '\n' + cleanedSvg;
}

/**
 * 注入 Markdown / Plain Text 文件的隐式注释块/头部信息
 */
export function injectAIGCToText(text: string, metadata: AIGCMetadata): string {
  // 检查是否已经存在 AIGC_METADATA 注释块，若存在则不重复替换或改写 ID，避免 ProduceID 不一致
  if (/<!--\s*AIGC_METADATA:[\s\S]*?-->/.test(text)) {
    return text;
  }
  const commentBlock = `<!-- AIGC_METADATA: ${JSON.stringify(metadata)} -->`;
  return `${commentBlock}\n\n${text.trim()}`;
}

/**
 * 将 AIGC 元数据作为 MOOV / free 备注 Box 注入 MP4 / 视频文件二进制 ArrayBuffer
 */
export function injectAIGCToMp4Buffer(arrayBuffer: ArrayBuffer, metadata: AIGCMetadata): ArrayBuffer {
  try {
    const jsonStr = JSON.stringify({ aigcMetadata: metadata });
    const payload = new TextEncoder().encode(jsonStr);
    
    // MP4 Box 结构: [4 字节大端长度] [4 字节 Box 类型 'free'] [Box 数据内容]
    const boxLen = 8 + payload.length;
    const box = new Uint8Array(boxLen);
    const view = new DataView(box.buffer);
    view.setUint32(0, boxLen, false); // 大端序 Length
    box[4] = 0x66; box[5] = 0x72; box[6] = 0x65; box[7] = 0x65; // ASCII 'free'
    box.set(payload, 8);

    const origBytes = new Uint8Array(arrayBuffer);
    const result = new Uint8Array(origBytes.length + boxLen);
    result.set(origBytes, 0);
    result.set(box, origBytes.length);
    return result.buffer;
  } catch (e) {
    console.warn('MP4 AIGC metadata injection failed, fallback to original buffer:', e);
    return arrayBuffer;
  }
}

/**
 * 将 AIGC 元数据注入 JPEG / WebP / 音频等二进制文件尾部（绝不篡改原文件编码头与数据流）
 */
export function injectAIGCToJpegBuffer(arrayBuffer: ArrayBuffer, metadata: AIGCMetadata): ArrayBuffer {
  try {
    const jsonStr = `\n<!-- AIGC_METADATA: ${JSON.stringify(metadata)} -->`;
    const payload = new TextEncoder().encode(jsonStr);
    const origBytes = new Uint8Array(arrayBuffer);
    const result = new Uint8Array(origBytes.length + payload.length);
    result.set(origBytes, 0);
    result.set(payload, origBytes.length);
    return result.buffer;
  } catch (e) {
    console.warn('Binary AIGC metadata injection failed, fallback to original buffer:', e);
    return arrayBuffer;
  }
}

/**
 * 注入 JSON 格式数据的 AIGC 隐式元数据字段
 */
export function injectAIGCToJson<T extends object>(jsonObject: T, metadata: AIGCMetadata): T & { aigcMetadata: AIGCMetadata } {
  if ('aigcMetadata' in jsonObject && (jsonObject as any).aigcMetadata) {
    return jsonObject as T & { aigcMetadata: AIGCMetadata };
  }
  return {
    ...jsonObject,
    aigcMetadata: metadata,
  };
}

import { fetchMediaBlob } from './mediaCache';
import { burnImageWatermark, DEFAULT_WATERMARK_LABEL } from './explicit-watermark';

/**
 * 辅助函数：尝试通过 Image + Canvas 绘制将图片转为本地 PNG Blob (解决 CORS 阻断 fetch 的情况)
 */
function tryCanvasToBlob(imageUrl: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 512;
        canvas.height = img.naturalHeight || img.height || 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
          return;
        }
      } catch (e) {
        console.warn('Canvas toBlob tainted:', e);
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * 处理下载/导出的统一函数 (自动嵌入合规 AIGC 元数据，防破坏安全保障，100% 内存 Blob 下载，绝不跳转页面)
 */
export async function downloadWithAIGCMetadata(
  contentOrBlob: string | Blob | ArrayBuffer,
  filename: string,
  mimeType: string
): Promise<void> {
  // Check exportMode from settings
  let exportMode = 'agree_with_watermark';
  try {
    if (typeof window !== 'undefined') {
      const saved = getDecryptedItem('harmony-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.exportMode) {
          exportMode = parsed.exportMode;
        }
      }
    }
  } catch {
    // fallback default
  }

  if (exportMode === 'disabled') {
    console.warn('Export feature is disabled by user settings.');
    return;
  }

  const metadata = createAIGCMetadata();
  let finalBlob: Blob | null = null;

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const lowerMime = (mimeType || '').toLowerCase();

  const isPng = lowerMime.includes('png') || ext === 'png';
  const isSvg = lowerMime.includes('svg') || ext === 'svg';
  const isJson = lowerMime.includes('json') || ext === 'json';
  const isText = lowerMime.includes('markdown') || lowerMime.includes('text') || ext === 'md' || ext === 'txt';
  const isVideo = lowerMime.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
  const isAudio = lowerMime.startsWith('audio/') || ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(ext);
  const isImage = lowerMime.startsWith('image/') || ['jpg', 'jpeg', 'webp', 'gif', 'bmp', 'png', 'svg'].includes(ext);

  const isUrlString = typeof contentOrBlob === 'string' && (
    contentOrBlob.startsWith('http://') ||
    contentOrBlob.startsWith('https://') ||
    contentOrBlob.startsWith('blob:') ||
    contentOrBlob.startsWith('data:')
  );

  // 对于非 SVG 图片类型文件，下载时根据 exportMode 决定是否烧录显式水印
  if (isImage && !isSvg && exportMode !== 'agree_no_watermark') {
    try {
      let imageSrcToBurn = '';
      if (typeof contentOrBlob === 'string') {
        imageSrcToBurn = contentOrBlob;
      } else if (contentOrBlob instanceof Blob) {
        imageSrcToBurn = URL.createObjectURL(contentOrBlob);
      }
      if (imageSrcToBurn) {
        const watermarkedUrl = await burnImageWatermark(imageSrcToBurn, DEFAULT_WATERMARK_LABEL);
        if (watermarkedUrl && watermarkedUrl.startsWith('data:image')) {
          contentOrBlob = watermarkedUrl;
        }
      }
    } catch (e) {
      console.warn('Failed to burn image watermark before download:', e);
    }
  }

  // 通用辅助函数：获取 ArrayBuffer 二进制数据流
  const getArrayBufferFromContent = async (): Promise<ArrayBuffer | null> => {
    if (contentOrBlob instanceof ArrayBuffer) {
      return contentOrBlob;
    }
    if (contentOrBlob instanceof Blob) {
      return await contentOrBlob.arrayBuffer();
    }
    if (typeof contentOrBlob === 'string') {
      const str = contentOrBlob;
      // Data URL -> decode Base64 directly or fetch to Blob -> ArrayBuffer
      if (str.startsWith('data:')) {
        try {
          const base64Index = str.indexOf(';base64,');
          if (base64Index !== -1) {
            const base64Str = str.substring(base64Index + 8);
            const binaryString = atob(base64Str);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
          }
          const res = await fetch(str);
          const b = await res.blob();
          return await b.arrayBuffer();
        } catch (e) {
          console.warn('Data URL arrayBuffer error:', e);
        }
      }
      if (isUrlString) {
        // 1. 优先从 IndexedDB 或本地缓存获取 Blob
        const fetched = await fetchMediaBlob(str).catch(() => null);
        if (fetched && fetched.blob) {
          return await fetched.blob.arrayBuffer();
        }
        // 2. 尝试直接 fetch
        let res: Response | null = null;
        try {
          res = await fetch(str);
          if (!res.ok) res = null;
        } catch (e) {
          console.warn('Fetch URL directly failed:', e);
          res = null;
        }
        
        // 3. 尝试通过代理 fetch (绕过 CORS)
        if (!res) {
          try {
            const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(str)}`;
            res = await fetch(proxyUrl);
            if (!res?.ok) {
              const publicProxyUrl = `https://corsproxy.io/?${encodeURIComponent(str)}`;
              res = await fetch(publicProxyUrl);
            }
            if (!res?.ok) res = null;
          } catch (e) {
            try {
               const publicProxyUrl = `https://corsproxy.io/?${encodeURIComponent(str)}`;
               res = await fetch(publicProxyUrl);
               if (!res?.ok) res = null;
            } catch {
               console.warn('Fetch via proxy failed:', e);
               res = null;
            }
          }
        }
        
        if (res) {
          return await res.arrayBuffer();
        }

        // 4. 如果是图片，尝试使用 Canvas 转换
        if (isImage) {
          const canvasBlob = await tryCanvasToBlob(str);
          if (canvasBlob) {
            return await canvasBlob.arrayBuffer();
          }
        }
      }
    }
    return null;
  };

  if (isVideo) {
    // 视频类 (MP4/WebM等): 提取二进制并在末尾/MOOV写入备注，不篡改音视频编码帧
    const buffer = await getArrayBufferFromContent();
    if (buffer && buffer.byteLength > 0) {
      const injected = injectAIGCToMp4Buffer(buffer, metadata);
      finalBlob = new Blob([injected], { type: lowerMime || 'video/mp4' });
    }

  } else if (isPng) {
    // PNG 图片类: 写入标准 tEXt Chunk AIGC 标识
    const buffer = await getArrayBufferFromContent();
    if (buffer && buffer.byteLength > 0) {
      const bytes = new Uint8Array(buffer);
      const isHeaderPng = bytes.length >= 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
        bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;

      if (isHeaderPng) {
        const injected = injectAIGCToPngBuffer(buffer, metadata);
        finalBlob = new Blob([injected], { type: 'image/png' });
      } else {
        finalBlob = new Blob([buffer], { type: 'image/png' });
      }
    }

  } else if (isImage || isAudio) {
    // JPG/WebP 图片或音频文件: 安全追加 AIGC 元数据尾部，保留原流编码
    const buffer = await getArrayBufferFromContent();
    if (buffer && buffer.byteLength > 0) {
      const injected = injectAIGCToJpegBuffer(buffer, metadata);
      finalBlob = new Blob([injected], { type: lowerMime || (isAudio ? 'audio/mpeg' : 'image/jpeg') });
    }

  } else if (isSvg) {
    let svgText = '';
    if (contentOrBlob instanceof Blob) {
      svgText = await contentOrBlob.text();
    } else {
      svgText = String(contentOrBlob);
    }
    const injectedSvg = injectAIGCToSvg(svgText, metadata);
    finalBlob = new Blob([injectedSvg], { type: 'image/svg+xml;charset=utf-8' });

  } else if (isJson) {
    let jsonText = '';
    if (contentOrBlob instanceof Blob) {
      jsonText = await contentOrBlob.text();
    } else {
      jsonText = String(contentOrBlob);
    }
    try {
      const parsed = JSON.parse(jsonText);
      const injected = injectAIGCToJson(parsed, metadata);
      finalBlob = new Blob([JSON.stringify(injected, null, 2)], { type: 'application/json;charset=utf-8' });
    } catch {
      const injectedText = injectAIGCToText(jsonText, metadata);
      finalBlob = new Blob([injectedText], { type: 'application/json;charset=utf-8' });
    }

  } else if (isText) {
    let rawText = '';
    if (contentOrBlob instanceof Blob) {
      rawText = await contentOrBlob.text();
    } else {
      rawText = String(contentOrBlob);
    }
    const injectedText = injectAIGCToText(rawText, metadata);
    finalBlob = new Blob([injectedText], { type: `${mimeType || 'text/plain'};charset=utf-8` });
  }

  // 兜底防御：若 finalBlob 尚未构造成功且内容包含原始 Blob/Buffer
  if (!finalBlob) {
    if (contentOrBlob instanceof Blob) {
      finalBlob = contentOrBlob;
    } else if (contentOrBlob instanceof ArrayBuffer) {
      finalBlob = new Blob([contentOrBlob], { type: mimeType || 'application/octet-stream' });
    }
  }

  // 100% 原生内存 Blob 静默下载，绝不设置 a.href 为外部 URL，绝不触发页面跳转/新窗口播放！
  if (finalBlob && finalBlob.size > 0) {
    const blobUrl = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
  } else {
    console.warn('Unable to download file: Binary Blob creation failed in memory.');
  }
}
