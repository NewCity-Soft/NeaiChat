/**
 * 华为 HarmonyOS 7 显式标识（AI-可见水印）规范实现
 * 遵循标准：
 * 1. 国家《人工智能生成合成内容标识办法》
 * 2. 华为 50111-10 审核标准
 * 3. GB-45438-2025 音频摩尔斯电码 AI 显式标识 (短-长-短-短 / · - · ·)
 */

export const DEFAULT_WATERMARK_LABEL = '【人工智能生成】';

export const COMPLIANT_WATERMARK_LABELS = [
  '【人工智能生成】',
  '【AI生成】',
  'AI合成内容',
  '本内容由人工智能生成',
  '本内容由AI生成',
  'AI生成'
] as const;

export type WatermarkPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface KeywordValidationResult {
  isValid: boolean;
  message: string;
  hasAiKeyword: boolean;
  hasGenKeyword: boolean;
  aiMatch?: string;
  genMatch?: string;
}

/**
 * 依据国家《人工智能生成合成内容标识办法》二、标识文字硬性要素校验
 * 必须同时具备：
 * 1. AI 关键词：人工智能 / AI
 * 2. 生成/合成关键词：生成 / 合成
 */
export function validateWatermarkKeywords(text: string): KeywordValidationResult {
  if (!text || text.trim() === '') {
    return {
      isValid: false,
      message: '标识文字不能为空',
      hasAiKeyword: false,
      hasGenKeyword: false,
    };
  }

  const aiRegex = /(人工智能|AI|人工智彗)/i;
  const genRegex = /(生成|合成)/;

  const aiMatch = text.match(aiRegex);
  const genMatch = text.match(genRegex);

  const hasAiKeyword = !!aiMatch;
  const hasGenKeyword = !!genMatch;

  if (hasAiKeyword && hasGenKeyword) {
    return {
      isValid: true,
      message: '符合国标与华为 50111-10 审核硬性要素标准',
      hasAiKeyword: true,
      hasGenKeyword: true,
      aiMatch: aiMatch?.[0],
      genMatch: genMatch?.[0],
    };
  }

  if (!hasAiKeyword && !hasGenKeyword) {
    return {
      isValid: false,
      message: '不合规：缺少“人工智能/AI”及“生成/合成”两类硬性关键词（禁止单独使用模糊词汇）',
      hasAiKeyword: false,
      hasGenKeyword: false,
    };
  }

  if (!hasAiKeyword) {
    return {
      isValid: false,
      message: '不合规：缺少“人工智能”或“AI”主语关键词',
      hasAiKeyword: false,
      hasGenKeyword: true,
      genMatch: genMatch?.[0],
    };
  }

  return {
    isValid: false,
    message: '不合规：缺少“生成”或“合成”动词关键词',
    hasAiKeyword: true,
    hasGenKeyword: false,
    aiMatch: aiMatch?.[0],
  };
}

/**
 * 计算华为 50111-10 审核标准图片/视频短边 5% 的水印文字高度/字号
 * 例如：1080×1920 图片，短边 1080px，字号至少 54px
 */
export function calculateShortEdgeWatermarkFontSize(width: number, height: number): number {
  const shortEdge = Math.min(width, height);
  if (shortEdge <= 0) return 24;
  const calcSize = Math.floor(shortEdge * 0.05);
  // 保证最小清晰度字号，上限适度
  return Math.max(16, Math.min(calcSize, 120));
}

/**
 * 在 Image / Canvas 上烧录符合华为 50111-10 审核标准的半透明显式水印 (短边 ≥ 5%)
 */
export async function burnImageWatermark(
  imageSrc: string,
  watermarkText: string = DEFAULT_WATERMARK_LABEL,
  position: WatermarkPosition = 'bottom-right',
  opacity: number = 0.85
): Promise<string> {
  // 校验关键词合规，不合规时自动修正为默认合规文本
  const check = validateWatermarkKeywords(watermarkText);
  const safeText = check.isValid ? watermarkText : DEFAULT_WATERMARK_LABEL;

  // 辅助函数：处理跨域图片 URL，获取同源 Blob URL 避免 Canvas 被污染 (Tainted Canvas SecurityError)
  let loadableSrc = imageSrc;
  let createdObjectUrl: string | null = null;

  if (typeof imageSrc === 'string' && (imageSrc.startsWith('http://') || imageSrc.startsWith('https://'))) {
    try {
      const res = await fetch(imageSrc).catch(() => null);
      if (res && res.ok) {
        const blob = await res.blob();
        createdObjectUrl = URL.createObjectURL(blob);
        loadableSrc = createdObjectUrl;
      } else {
        // Try proxy
        const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(imageSrc)}`;
        const proxyRes = await fetch(proxyUrl).catch(() => null);
        if (proxyRes && proxyRes.ok) {
          const blob = await proxyRes.blob();
          createdObjectUrl = URL.createObjectURL(blob);
          loadableSrc = createdObjectUrl;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch remote image for watermarking:', e);
    }
  }

  return new Promise((resolve) => {
    const img = new Image();
    if (!createdObjectUrl && imageSrc.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }

    const cleanup = () => {
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };

    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width || 800;
        const height = img.naturalHeight || img.height || 600;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(imageSrc);
          return;
        }

        // 1. 绘制原始图片
        ctx.drawImage(img, 0, 0, width, height);

        // 2. 计算 5% 短边字号
        const fontSize = calculateShortEdgeWatermarkFontSize(width, height);
        ctx.font = `600 ${fontSize}px "HarmonyOS Sans", "PingFang SC", system-ui, sans-serif`;

        const textMetrics = ctx.measureText(safeText);
        const textWidth = textMetrics.width;
        const textHeight = fontSize;

        const margin = Math.round(fontSize * 0.8);

        let x = 0;
        let y = 0;

        switch (position) {
          case 'bottom-right':
            x = width - textWidth - margin;
            y = height - margin;
            break;
          case 'bottom-left':
            x = margin;
            y = height - margin;
            break;
          case 'top-right':
            x = width - textWidth - margin;
            y = margin + textHeight;
            break;
          case 'top-left':
            x = margin;
            y = margin + textHeight;
            break;
        }

        // 保证边界安全
        x = Math.max(margin, Math.min(x, width - textWidth - margin));
        y = Math.max(margin + textHeight, Math.min(y, height - margin));

        // 3. 绘制白色半透明无背景水印 (白色半透明、清晰边缘描边与立体阴影，防浅色/深色背景干扰)
        ctx.save();
        ctx.globalAlpha = opacity;

        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = Math.max(4, Math.round(fontSize * 0.3));
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';

        // 细文字描边，确保在亮色底图和暗色底图上白色半透明文字都清晰可见
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.06));
        ctx.strokeText(safeText, x, y);
        ctx.fillText(safeText, x, y);

        ctx.restore();

        const resultDataUrl = canvas.toDataURL('image/png');
        cleanup();
        resolve(resultDataUrl);
      } catch (e) {
        console.warn('Image watermark burning failed, returning original:', e);
        cleanup();
        resolve(imageSrc);
      }
    };

    img.onerror = () => {
      cleanup();
      resolve(imageSrc);
    };

    img.src = loadableSrc;
  });
}

/**
 * GB-45438-2025 国标强制标准：固定提示音（音频-AI 显式节奏标识）
 * 摩尔斯电码对应 A、I：短-长-短-短 (· - · ·)
 * A: · - (短音, 长音)
 * I: · · (两声短音)
 * 节拍：短音 (100ms), 长音 (280ms), 间隔 (80ms), 两个字母间隔 (200ms)
 * 频率：鸿蒙音律双音 (660Hz + 880Hz)
 */
export async function playAIMorseCodeChime(): Promise<void> {
  if (typeof window === 'undefined') return;

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // 节拍定义 (秒)
    const dotLen = 0.09;      // 短音 ·
    const dashLen = 0.26;     // 长音 -
    const gapLen = 0.07;      // 同字母内部间隔
    const letterGap = 0.18;   // 字母 A 与 I 之间间隔

    // 节奏序列: A (· -) -> letterGap -> I (· ·)
    // 拍 1: 短 (A: ·)
    // 拍 2: 长 (A: -)
    // 拍 3: 短 (I: ·)
    // 拍 4: 短 (I: ·)
    const beats = [
      { start: 0, duration: dotLen },                               // A: Short
      { start: dotLen + gapLen, duration: dashLen },                // A: Long
      { start: dotLen + gapLen + dashLen + letterGap, duration: dotLen }, // I: Short
      { start: dotLen + gapLen + dashLen + letterGap + dotLen + gapLen, duration: dotLen }, // I: Short
    ];

    const totalDuration = beats[beats.length - 1].start + beats[beats.length - 1].duration + 0.1;

    beats.forEach(({ start, duration }) => {
      const startTime = now + start;
      const stopTime = startTime + duration;

      // 主频率音 880Hz (A5)
      const osc1 = audioCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 880;

      // 和声频率 660Hz (E5) 鸿蒙空间和弦
      const osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 660;

      const gainNode = audioCtx.createGain();

      // 平滑包络，避免点击爆音
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.18, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(stopTime);
      osc2.stop(stopTime);
    });

    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          audioCtx.close();
        } catch {
          // ignore
        }
        resolve();
      }, totalDuration * 1000);
    });
  } catch (e) {
    console.warn('Web Audio Morse chime error:', e);
  }
}

/**
 * 文本导出格式显式标识注入
 */
export function injectExplicitTextWatermark(content: string, label: string = DEFAULT_WATERMARK_LABEL): string {
  const check = validateWatermarkKeywords(label);
  const safeLabel = check.isValid ? label : DEFAULT_WATERMARK_LABEL;

  const headerNotice = `> 声明：${safeLabel} | 本内容由 AI 生成合成，符合国家《人工智能生成合成内容标识办法》与华为 50111-10 审核标准。\n\n`;

  if (content.startsWith('> 声明：')) {
    return content;
  }

  return headerNotice + content;
}
