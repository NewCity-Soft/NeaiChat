import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Copy, Check, FileText, FileJson, SlidersHorizontal, Eye, Sparkles, Printer } from 'lucide-react';
import { Chat } from '../types';
import { ExportOptions, generateExportContent, downloadFile, formatFileSize } from '../utils/export-utils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat | null;
  modelName?: string;
  apiUrl?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, chat, modelName, apiUrl }) => {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'markdown',
    includeSystemMessages: true,
    includeTimestamps: true,
    includeMetadata: true,
    includeToolCalls: true,
  });

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'options'>('preview');

  const content = useMemo(() => {
    if (!chat) return '';
    return generateExportContent(chat, options, modelName, apiUrl);
  }, [chat, options, modelName, apiUrl]);

  if (!isOpen || !chat) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  };

  const handleDownload = () => {
    if (options.format === 'pdf') {
      onClose();
      // Delay to allow modal close animation to finish before printing
      setTimeout(() => {
        window.print();
      }, 300);
      return;
    }

    const sanitizeTitle = (chat.title || 'chat')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 30);
    const dateStr = new Date().toISOString().slice(0, 10);
    const ext = options.format === 'markdown' ? 'md' : 'json';
    const filename = `${sanitizeTitle}_${dateStr}.${ext}`;
    const mimeType = options.format === 'markdown' ? 'text/markdown' : 'application/json';

    downloadFile(content, filename, mimeType);
  };

  const charCount = content.length;
  const lineCount = content ? content.split('\n').length : 0;
  const estimatedBytes = new Blob([content]).size;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="relative flex flex-col bg-bg-primary dark:bg-bg-primary-dark w-full max-w-4xl h-[90vh] max-h-[820px] rounded-[28px] sm:rounded-[32px] border border-gray-200/60 dark:border-gray-800/60 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/60 dark:bg-black/40 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight flex items-center gap-2">
                  导出当前对话
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs sm:max-w-md">
                  {chat.title || '未命名对话'} ({chat.messages.length} 条消息)
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Body Grid */}
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* Options Left Pane */}
            <div className="w-full md:w-80 lg:w-90 border-b md:border-b-0 md:border-r border-gray-200/50 dark:border-gray-800/50 p-5 overflow-y-auto space-y-6 bg-gray-50/50 dark:bg-[#161618]/50 shrink-0">
              
              {/* Format Switcher */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 block">
                  导出格式
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setOptions({ ...options, format: 'markdown' })}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-center cursor-pointer min-h-[80px] ${
                      options.format === 'markdown'
                        ? 'bg-brand/10 dark:bg-brand-dark/20 border-brand dark:border-brand-dark text-brand dark:text-brand-dark font-bold shadow-xs'
                        : 'bg-white dark:bg-gray-900/60 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80'
                    }`}
                  >
                    <FileText className="w-6 h-6 mb-1.5" />
                    <span className="text-sm">Markdown</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">.md 文档</span>
                  </button>

                  <button
                    onClick={() => setOptions({ ...options, format: 'json' })}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-center cursor-pointer min-h-[80px] ${
                      options.format === 'json'
                        ? 'bg-brand/10 dark:bg-brand-dark/20 border-brand dark:border-brand-dark text-brand dark:text-brand-dark font-bold shadow-xs'
                        : 'bg-white dark:bg-gray-900/60 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80'
                    }`}
                  >
                    <FileJson className="w-6 h-6 mb-1.5" />
                    <span className="text-sm">JSON 数据</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">.json 结构</span>
                  </button>

                  <button
                    onClick={() => setOptions({ ...options, format: 'pdf' })}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-center cursor-pointer min-h-[80px] ${
                      options.format === 'pdf'
                        ? 'bg-brand/10 dark:bg-brand-dark/20 border-brand dark:border-brand-dark text-brand dark:text-brand-dark font-bold shadow-xs'
                        : 'bg-white dark:bg-gray-900/60 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80'
                    }`}
                  >
                    <Printer className="w-6 h-6 mb-1.5" />
                    <span className="text-sm">PDF 文件</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">打印导出</span>
                  </button>
                </div>
              </div>

              {/* Advanced Options Toggles */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 block flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  包含内容选项
                </label>
                <div className="space-y-2.5 bg-white dark:bg-gray-900/60 p-3.5 rounded-2xl border border-gray-200/60 dark:border-gray-800/60">
                  <label className="flex items-center justify-between cursor-pointer text-sm text-gray-700 dark:text-gray-300 py-1">
                    <span>头部元数据信息</span>
                    <input
                      type="checkbox"
                      checked={options.includeMetadata}
                      onChange={(e) => setOptions({ ...options, includeMetadata: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand dark:accent-brand-dark cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer text-sm text-gray-700 dark:text-gray-300 py-1 border-t border-gray-100 dark:border-gray-800/60">
                    <span>消息时间戳</span>
                    <input
                      type="checkbox"
                      checked={options.includeTimestamps}
                      onChange={(e) => setOptions({ ...options, includeTimestamps: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand dark:accent-brand-dark cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer text-sm text-gray-700 dark:text-gray-300 py-1 border-t border-gray-100 dark:border-gray-800/60">
                    <span>系统与摘要消息</span>
                    <input
                      type="checkbox"
                      checked={options.includeSystemMessages}
                      onChange={(e) => setOptions({ ...options, includeSystemMessages: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand dark:accent-brand-dark cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer text-sm text-gray-700 dark:text-gray-300 py-1 border-t border-gray-100 dark:border-gray-800/60">
                    <span>工具调用日志</span>
                    <input
                      type="checkbox"
                      checked={options.includeToolCalls}
                      onChange={(e) => setOptions({ ...options, includeToolCalls: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand dark:accent-brand-dark cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Statistics Card */}
              <div className="bg-white dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 text-xs text-gray-500 dark:text-gray-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>总字数:</span>
                  <span className="font-mono text-gray-800 dark:text-gray-200 font-medium">{charCount.toLocaleString()} 字符</span>
                </div>
                <div className="flex justify-between">
                  <span>总行数:</span>
                  <span className="font-mono text-gray-800 dark:text-gray-200 font-medium">{lineCount.toLocaleString()} 行</span>
                </div>
                <div className="flex justify-between">
                  <span>文件大小:</span>
                  <span className="font-mono text-gray-800 dark:text-gray-200 font-medium">{formatFileSize(estimatedBytes)}</span>
                </div>
              </div>
            </div>

            {/* Content Preview Right Pane */}
            <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-black/30 p-4 sm:p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  文件预览 ({options.format.toUpperCase()})
                </span>
                <span className="text-[11px] text-gray-400 font-mono">
                  {options.format === 'markdown' ? 'UTF-8 Markdown text' : 'UTF-8 JSON data'}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-[#121214] rounded-2xl border border-gray-200/70 dark:border-gray-800/70 font-mono text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed select-text">
                {options.format === 'pdf' ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
                    <div className="p-4 rounded-full bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark">
                      <Printer className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-base font-bold text-gray-900 dark:text-white">PDF 导出模式</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs font-sans">
                        PDF 格式将直接调用打印接口。点击下方按钮后，请在打印预览对话框中选择 “另存为 PDF”。
                      </p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60 rounded-xl p-3 text-[11px] text-amber-800 dark:text-amber-200 font-sans leading-snug">
                      ⚠️ 提示：为了获得最佳排版效果，请在打印设置中确保勾选了 “背景图形”。
                    </div>
                  </div>
                ) : (
                  content || <span className="text-gray-400 italic">暂无包含内容</span>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200/50 dark:border-gray-800/50 bg-white/70 dark:bg-black/50 backdrop-blur-xl shrink-0 gap-3">
            <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
              文件将保存至您的本地默认下载路径
            </p>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                onClick={handleCopy}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                {copied ? '已复制到剪贴板' : '复制内容'}
              </button>

              <button
                onClick={handleDownload}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-2xl bg-brand dark:bg-brand-dark hover:opacity-90 active:scale-[0.98] text-white text-sm font-medium transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                {options.format === 'pdf' ? (
                  <>
                    <Printer className="w-4 h-4" />
                    调用打印 / 另存为 PDF
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    下载 {options.format === 'markdown' ? '.MD 文件' : '.JSON 文件'}
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
