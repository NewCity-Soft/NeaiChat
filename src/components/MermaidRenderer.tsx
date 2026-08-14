import { useEffect, useRef, useState, memo } from 'react';
import mermaid from 'mermaid';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, Paperclip, Maximize2, Download, Image as ImageIcon, FileCode } from 'lucide-react';
import { getDecryptedItem } from '../utils/encryption';
import { downloadWithAIGCMetadata } from '../utils/aigc-metadata';

mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  securityLevel: 'loose',
  fontFamily: 'HarmonyOS Sans, Inter, system-ui, sans-serif',
  themeVariables: {
    primaryColor: '#0a59f7',
    primaryTextColor: '#fff',
    primaryBorderColor: '#0a59f7',
    lineColor: '#0a59f7',
    secondaryColor: '#f0f7ff',
    tertiaryColor: '#fff',
  },
  mindmap: {
    useMaxWidth: true,
    padding: 20,
  }
});

const mermaidCache = new Map<string, string>();

export const Mermaid = memo(
  ({ chart, onReference, onEnlarge }: { chart: string, onReference?: (code: string) => void, onEnlarge?: (url: string) => void }) => {
    const cachedSvg = mermaidCache.get(chart);
    const [svg, setSvg] = useState<string>(cachedSvg || '');
    const [isRendering, setIsRendering] = useState(!cachedSvg);
    const containerRef = useRef<HTMLDivElement>(null);

    const isExportDisabled = (() => {
      try {
        if (typeof window !== 'undefined') {
          const saved = getDecryptedItem('harmony-settings');
          return saved ? JSON.parse(saved).exportMode === 'disabled' : false;
        }
      } catch {}
      return false;
    })();

    useEffect(() => {
      if (!chart) return;

      if (mermaidCache.has(chart)) {
        setSvg(mermaidCache.get(chart)!);
        setIsRendering(false);
        return;
      }

      let isCancelled = false;
      setIsRendering(true);

      const renderChart = async () => {
        try {
          const renderId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
          const { svg: renderedSvg } = await mermaid.render(renderId, chart);
          if (!isCancelled) {
            mermaidCache.set(chart, renderedSvg);
            setSvg(renderedSvg);
            setIsRendering(false);
          }
        } catch (error) {
          console.error('Mermaid error:', error);
          if (!isCancelled) {
            setIsRendering(false);
          }
        }
      };

      renderChart();

      return () => {
        isCancelled = true;
      };
    }, [chart]);

    const downloadAsSvg = async () => {
      if (!svg) return;
      await downloadWithAIGCMetadata(svg, `mindmap-${Date.now()}.svg`, 'image/svg+xml');
    };

    const downloadAsPng = () => {
      if (!svg) return;
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      const svgElement = doc.querySelector('svg');
      if (!svgElement) return;

      const width = svgElement.viewBox.baseVal.width || 800;
      const height = svgElement.viewBox.baseVal.height || 600;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;

      const img = new Image();
      let svgWithNamespace = svg;
      if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
        svgWithNamespace = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgBlob = new Blob([svgWithNamespace], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = async () => {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const pngUrl = canvas.toDataURL('image/png');
        await downloadWithAIGCMetadata(pngUrl, `mindmap-${Date.now()}.png`, 'image/png');
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };

    const [showDownloadMenu, setShowDownloadMenu] = useState(false);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef(false);

    const handlePressStart = (e: React.MouseEvent | React.TouchEvent) => {
      isLongPress.current = false;
      longPressTimer.current = setTimeout(() => {
        isLongPress.current = true;
        setShowDownloadMenu(true);
      }, 500);
    };

    const handlePressEnd = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleDownloadClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isLongPress.current) {
        downloadAsPng();
      }
    };

    const handleEnlarge = () => {
      if (!svg) return;
      onEnlarge?.(svg);
    };

    return (
      <div className="relative group/mermaid my-6 group">
        <div 
          ref={containerRef}
          className={`bg-white dark:bg-white p-6 rounded-[24px] border border-gray-200 shadow-sm flex justify-center overflow-auto max-w-full transition-all hover:shadow-md ${svg ? 'cursor-zoom-in' : ''}`}
          style={{ minHeight: '100px' }}
          onClick={handleEnlarge}
        >
          {isRendering ? (
            <div className="flex items-center gap-2 text-gray-400 py-10">
              <RotateCcw className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">绘图中...</span>
            </div>
          ) : (
            <div 
              className="w-full flex justify-center"
              dangerouslySetInnerHTML={{ __html: svg }} 
            />
          )}
        </div>

        {!isRendering && svg && (
          <div className="absolute top-3 right-3 flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover/mermaid:opacity-100 transition-opacity">
            {onReference && (
              <button 
                onClick={(e) => { e.stopPropagation(); onReference(chart); }}
                className="p-2 bg-black/60 hover:bg-brand backdrop-blur-md rounded-full text-white shadow-lg transition-all"
                title="引用为附件"
              >
                <Paperclip className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); handleEnlarge(); }}
              className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full text-white shadow-lg transition-all"
              title="全屏查看"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            {!isExportDisabled && (
              <div className="relative">
                <button 
                  onMouseDown={handlePressStart}
                  onMouseUp={handlePressEnd}
                  onMouseLeave={handlePressEnd}
                  onTouchStart={handlePressStart}
                  onTouchEnd={handlePressEnd}
                  onClick={handleDownloadClick}
                  className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full text-white shadow-lg transition-all"
                  title="点击下载 PNG，长按下载 SVG"
                >
                  <Download className="w-4 h-4" />
                </button>

                <AnimatePresence>
                  {showDownloadMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-[110]" 
                        onClick={(e) => { e.stopPropagation(); setShowDownloadMenu(false); }}
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -10 }}
                        className="absolute top-full right-0 mt-2 p-2 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 z-[120] min-w-[140px]"
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadAsPng(); setShowDownloadMenu(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-left"
                        >
                          <ImageIcon className="w-4 h-4 text-brand" />
                          <span>下载 PNG</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadAsSvg(); setShowDownloadMenu(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-left"
                        >
                          <FileCode className="w-4 h-4 text-brand" />
                          <span>下载 SVG</span>
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.chart === nextProps.chart
);
