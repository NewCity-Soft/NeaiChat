import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';
import { Minus, Plus, RotateCcw, Download, X as XIcon } from 'lucide-react';
import { getDecryptedItem } from '../utils/encryption';
import { downloadWithAIGCMetadata } from '../utils/aigc-metadata';
import { burnImageWatermark, DEFAULT_WATERMARK_LABEL } from '../utils/explicit-watermark';

export const ImageLightbox = ({ url, isOpen, onClose }: { url: string | null; isOpen: boolean; onClose: () => void }) => {
  const isSvg = url?.trim().startsWith('<svg');
  const [isWatermarking, setIsWatermarking] = useState(false);
  
  // Use MotionValues for high-performance updates without re-renders
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Smooth scale display for the UI
  const [displayScale, setDisplayScale] = useState(1);

  const lastTouchDistance = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      scale.set(1);
      x.set(0);
      y.set(0);
      setDisplayScale(1);
      lastTouchDistance.current = null;
    }
  }, [isOpen, scale, x, y]);

  // Update the UI scale number periodically or on change
  useEffect(() => {
    const unsubscribe = scale.on('change', (v) => {
      // We only update React state for the textual display, which is fine
      setDisplayScale(v);
    });
    return unsubscribe;
  }, [scale]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(scale.get() * factor, 0.5), 10);
    
    // Direct update to MotionValue
    scale.set(newScale);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      lastTouchDistance.current = distance;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance.current !== null) {
      const distance = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      const factor = distance / lastTouchDistance.current;
      const newScale = Math.min(Math.max(scale.get() * factor, 0.5), 10);
      scale.set(newScale);
      lastTouchDistance.current = distance;
    }
  };

  const handleTouchEnd = () => {
    lastTouchDistance.current = null;
  };

  const updateScale = (factor: number) => {
    const currentScale = scale.get();
    const targetScale = Math.min(Math.max(currentScale * factor, 0.5), 10);
    animate(scale, targetScale, { type: 'spring', damping: 25, stiffness: 200 });
  };

  const resetView = () => {
    animate(scale, 1, { type: 'spring', damping: 25, stiffness: 200 });
    animate(x, 0, { type: 'spring', damping: 25, stiffness: 200 });
    animate(y, 0, { type: 'spring', damping: 25, stiffness: 200 });
  };

  return (
    <AnimatePresence>
      {isOpen && url && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 sm:p-10 overflow-hidden"
          onClick={onClose}
        >
          <div className="absolute top-6 left-6 text-white/50 text-sm pointer-events-none select-none hidden sm:block">
            双指缩放或滚动滚轮 • 拖动平移
          </div>

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <motion.div 
              drag
              dragMomentum={false}
              style={{ x, y, scale }}
              className="bg-white rounded-2xl overflow-hidden shadow-2xl p-4 sm:p-8 flex items-center justify-center cursor-grab active:cursor-grabbing will-change-transform relative group"
            >
              {isSvg ? (
                <div 
                  className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-[90vw] [&>svg]:max-h-[80vh] [&>svg]:object-contain pointer-events-none transform-gpu"
                  dangerouslySetInnerHTML={{ __html: url }}
                />
              ) : (
                <div className="relative inline-block max-w-[90vw] max-h-[80vh]">
                  <img 
                    src={url} 
                    alt="Preview" 
                    className="max-w-[90vw] max-h-[80vh] object-contain pointer-events-none transform-gpu rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </motion.div>

            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-2xl">
              <button 
                onClick={() => updateScale(1/1.5)}
                className="text-white/80 hover:text-white p-1 transition-colors"
              >
                <Minus className="w-5 h-5" />
              </button>
              <span className="text-white font-medium min-w-[3rem] text-center tabular-nums">
                {Math.round(displayScale * 100)}%
              </span>
              <button 
                onClick={() => updateScale(1.5)}
                className="text-white/80 hover:text-white p-1 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
              <div className="w-[1px] h-4 bg-white/20" />
              <button 
                onClick={resetView}
                className="text-white/80 hover:text-white p-1 transition-colors"
                title="重置"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            <div className="absolute top-6 right-6 flex items-center gap-3 z-[110]">
              {!(() => {
                try {
                  const saved = getDecryptedItem('harmony-settings');
                  return saved ? JSON.parse(saved).exportMode === 'disabled' : false;
                } catch { return false; }
              })() && (
                <button 
                  onClick={async () => {
                    if (!url || isWatermarking) return;
                    setIsWatermarking(true);
                    try {
                      const mime = isSvg ? 'image/svg+xml' : 'image/png';
                      const ext = isSvg ? 'svg' : 'png';
                      
                      // 华为 50111-10 审核规范：烧录短边 ≥5% 半透显式水印后保存
                      let finalUrl = url;
                      if (!isSvg) {
                        finalUrl = await burnImageWatermark(url, DEFAULT_WATERMARK_LABEL);
                      }
                      await downloadWithAIGCMetadata(finalUrl, `image-${Date.now()}.${ext}`, mime);
                    } finally {
                      setIsWatermarking(false);
                    }
                  }}
                  disabled={isWatermarking}
                  className="p-3 bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/10 rounded-full text-white transition-all active:scale-95 shadow-xl cursor-pointer disabled:opacity-50"
                  title="下载"
                >
                  <Download className="w-6 h-6" />
                </button>
              )}
              <button 
                onClick={onClose}
                className="p-3 bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/10 rounded-full text-white transition-all active:scale-95 shadow-xl"
                title="关闭"
              >
                <XIcon className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
