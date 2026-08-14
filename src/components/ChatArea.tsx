import { useEffect, useRef, useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { Bot, Copy, Check, Maximize2, ArrowDown, Pin, PinOff, ChevronDown, ChevronUp, Volume2, VolumeX, RotateCcw, ChevronLeft, ChevronRight, AlertTriangle, Trash2, ZoomIn, Download, Brain, Wrench, Paperclip, GitFork, Zap, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Message, Attachment, AppSettings, ToolbarItemConfig, ContentBlock } from '../types';
import { getDecryptedItem } from '../utils/encryption';
import { DEFAULT_BUBBLE_TOOLS, sanitizeToolbarConfig } from '../utils/toolbar-defaults';
import { Mermaid } from './MermaidRenderer';
import { ImageLightbox } from './ImageLightbox';
import { CodeBlock } from './CodeBlock';
import { FileCard } from './FileCard';
import { ThoughtBlock, parseThought } from './ThoughtBlock';
import { ChatInput } from './ChatInput';
import { ChatMessageToolbar } from './ChatMessageToolbar';
import { CodeRunnerModal } from './CodeRunnerModal';
import { downloadWithAIGCMetadata } from '../utils/aigc-metadata';
import { playAIMorseCodeChime, DEFAULT_WATERMARK_LABEL, burnImageWatermark } from '../utils/explicit-watermark';
import { useTranslation } from '../i18n';

const MediaDownloadLink = memo(({ href, children, ...props }: any) => {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);
  
  if (!href) return <a {...props}>{children}</a>;
  
  const isExportDisabled = (() => {
    try {
      const saved = getDecryptedItem('harmony-settings');
      return saved ? JSON.parse(saved).exportMode === 'disabled' : false;
    } catch { return false; }
  })();

  const lower = href.toLowerCase();
  const isVideo = lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.avi') || lower.includes('.mkv') || lower.startsWith('data:video');
  const isAudio = lower.includes('.mp3') || lower.includes('.wav') || lower.includes('.aac') || lower.includes('.m4a') || lower.startsWith('data:audio');
  const isImage = lower.includes('.png') || lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.webp') || lower.includes('.gif') || lower.includes('.svg') || lower.startsWith('data:image');
  const isMedia = isVideo || isAudio || isImage;

  if (isMedia && !isExportDisabled) {
    const ext = isVideo ? 'mp4' : isAudio ? 'mp3' : 'png';
    const mime = isVideo ? 'video/mp4' : isAudio ? 'audio/mpeg' : 'image/png';
    return (
      <a
        {...props}
        href={href}
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isDownloading) return;
          setIsDownloading(true);
          try {
            const fileName = `media-${Date.now()}.${ext}`;
            await downloadWithAIGCMetadata(href, fileName, mime);
          } finally {
            setIsDownloading(false);
          }
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 my-1 bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand-dark hover:bg-brand/20 dark:hover:bg-brand/30 rounded-lg text-xs font-medium transition-colors cursor-pointer no-underline border border-brand/20 ${isDownloading ? 'opacity-80 pointer-events-none' : ''}`}
        title={t('download_media_title', '静默下载媒体文件（内嵌 AIGC 元数据）')}
      >
        {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        <span>{isDownloading ? t('processing', '处理中...') : (children || t('download_media', '下载媒体文件'))}</span>
      </a>
    );
  }

  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand dark:text-brand-dark underline hover:opacity-80 transition-opacity"
    >
      {children}
    </a>
  );
});

const ImageWithActions = memo(({ src, alt, setLightboxUrl, setAttachments, ...props }: any) => {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);

  return (
    <div className="relative group/img my-4 inline-block max-w-full">
      <img
        {...props}
        src={src}
        alt={alt}
        className="max-w-full h-auto rounded-xl border border-gray-200 dark:border-gray-800 shadow-md hover:scale-[1.01] transition-transform cursor-zoom-in"
        referrerPolicy="no-referrer"
        onClick={() => setLightboxUrl(src)}
      />
      <div className="absolute top-3 right-3 flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100 transition-opacity">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setAttachments((prev: any[]) => {
              if (prev.some(a => a.url === src)) return prev;
              return [...prev, {
                id: crypto.randomUUID(),
                name: alt || 'image.png',
                type: 'image/png',
                url: src,
                size: 0
              }];
            });
          }}
          className="p-2 bg-black/60 hover:bg-brand backdrop-blur-md rounded-full text-white shadow-lg transition-all"
          title={t('cite_as_attachment', '引用为附件')}
        >
          <Paperclip className="w-4 h-4" />
        </button>
        {!(() => {
          try {
            const saved = getDecryptedItem('harmony-settings');
            return saved ? JSON.parse(saved).exportMode === 'disabled' : false;
          } catch { return false; }
        })() && (
          <button 
            onClick={async (e) => {
              e.stopPropagation();
              if (!src || isDownloading) return;
              setIsDownloading(true);
              try {
                const fileName = alt || `image-${Date.now()}.png`;
                await downloadWithAIGCMetadata(src, fileName, 'image/png');
              } finally {
                setIsDownloading(false);
              }
            }}
            disabled={isDownloading}
            className={`p-2 bg-black/60 backdrop-blur-md rounded-full text-white shadow-lg transition-all ${isDownloading ? 'opacity-80 cursor-not-allowed' : 'hover:bg-black/80 cursor-pointer'}`}
            title={t('download_image', '下载图片')}
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
        )}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setLightboxUrl(src);
          }}
          className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full text-white shadow-lg transition-all"
          title={t('view_original_image', '查看原图')}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (content: string, attachments?: Attachment[]) => void;
  isStreaming: boolean;
  onStopGeneration: () => void;
  onTogglePin: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onEditMessage: (messageId: string, content: string) => void;
  onSwitchVersion: (messageId: string, index: number) => void;
  onDeleteMessage: (messageId: string) => void;
  onBranchChat?: (messageId: string) => void;
  onCompressChat?: () => void;
  isCompressing?: boolean;
  theme: 'light' | 'dark';
  initialInput?: string;
  pyodideProgress?: { percent: number; message: string } | null;
  bubbleToolsConfig?: ToolbarItemConfig[];
  settings?: AppSettings;
  watermarkLabel?: string;
  onOpenWatermarkModal?: () => void;
  onOpenVFS?: () => void;
  chatTitle?: string;
}

export function ChatArea({ 
  messages, 
  onSendMessage, 
  isStreaming, 
  onStopGeneration, 
  onTogglePin, 
  onRegenerate, 
  onEditMessage,
  onSwitchVersion, 
  onDeleteMessage,
  onBranchChat,
  onCompressChat,
  isCompressing,
  theme,
  initialInput,
  pyodideProgress,
  bubbleToolsConfig,
  settings,
  watermarkLabel = DEFAULT_WATERMARK_LABEL,
  onOpenWatermarkModal,
  onOpenVFS,
  chatTitle
}: ChatAreaProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesRef = useRef<Message[]>(messages);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isPinnedCollapsed, setIsPinnedCollapsed] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [runnerState, setRunnerState] = useState<{ isOpen: boolean; code: string; language: string; autoRun: boolean }>({
    isOpen: false,
    code: '',
    language: '',
    autoRun: false,
  });

  // State lifted from ChatInput to support "Reference as attachment"
  const [input, setInput] = useState(() => {
    try {
      return localStorage.getItem('chat_input_draft') || '';
    } catch (e) {
      return '';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('chat_input_draft', input);
    } catch (e) {
      console.error('Failed to save draft:', e);
    }
  }, [input]);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleInject = (e: Event) => {
      const customEvent = e as CustomEvent<Attachment>;
      const attachment = customEvent.detail;
      setAttachments(prev => {
        // Avoid duplicate attachments based on name and size
        if (prev.some(a => a.name === attachment.name && a.size === attachment.size)) {
          return prev;
        }
        return [...prev, attachment];
      });
    };
    window.addEventListener('inject-attachment', handleInject);
    return () => window.removeEventListener('inject-attachment', handleInject);
  }, []);

  useEffect(() => {
    if (initialInput) {
      setInput(prev => prev ? prev + '\n' + initialInput : initialInput);
    }
  }, [initialInput]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    const prev = prevMessagesRef.current;
    const isDeletion = messages.length < prev.length && messages.length > 0 && prev.length > 0 && messages[0].id === prev[0].id;
    
    if (!isDeletion || isStreaming) {
      scrollToBottom();
    }
    
    prevMessagesRef.current = messages;
  }, [messages, isStreaming]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Show button if we're more than 300px from the bottom
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
    setShowScrollButton(!isNearBottom);
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSpeak = async (id: string, text: string) => {
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    // Stop any existing speech
    window.speechSynthesis.cancel();
    setSpeakingId(id);

    // GB-45438-2025 国标：音频开头播放 AI 显式摩尔斯电码提示音 (· - · ·)
    await playAIMorseCodeChime();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set language to match the UI if possible, or default to Chinese
    utterance.lang = 'zh-CN';
    
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      setSpeakingId(null);
      if ((e as any).error === 'voice-unavailable' || (e as any).error === 'engine-error') {
        alert('系统语音引擎不可用，请在安卓系统设置中检查语音合成引擎。');
      }
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const toggleExpandedToolCall = (id: string) => {
    setExpandedToolCalls(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveEdit = () => {
    if (editingMessageId && editingContent.trim()) {
      onEditMessage(editingMessageId, editingContent.trim());
      setEditingMessageId(null);
      setEditingContent('');
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent('');
  };

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      {/* Messages Area */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:px-6 md:px-8 py-6 scroll-smooth w-full chat-messages-container"
      >
        <div className="w-full max-w-5xl mx-auto space-y-6 pb-32">
          {/* Print-only Header */}
          <div className="print-only mb-10 border-b-2 border-gray-100 pb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{chatTitle || t('chat_history_title', '对话记录')}</h1>
            <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>{t('aigc_declaration', 'AI 合成内容声明')}</span>
              </div>
              <span>{t('export_time', '导出时间')}: {new Date().toLocaleString()}</span>
              <span>{t('message_count', '消息总数')}: {messages.length}</span>
              {settings?.model && <span>{t('model_name_label', '生成模型')}: {settings.model}</span>}
            </div>
            <p className="mt-4 text-xs text-gray-400 leading-relaxed font-sans">
              {t('export_disclaimer', '🛡️ 本文档由 NeaiChat 导出，包含 AI 人工智能合成内容。依据 HarmonyOS 7 AIGC 标识规范，本文档包含显式与隐式溯源信息。')}
            </p>
          </div>

        {/* Compression Progress Central Indicator */}
        <AnimatePresence>
          {isCompressing && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              className="sticky top-2 z-30 flex items-center justify-center my-2 gap-3 w-full max-w-md mx-auto select-none backdrop-blur-sm p-1 rounded-full"
            >
              <div className="h-[1px] bg-gray-300 dark:bg-gray-700 flex-1" />
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-100/90 dark:bg-gray-800/90 backdrop-blur-md border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400 shadow-md">
                <Zap className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
                <span>{t('compressing_chat', '正在压缩对话...')}</span>
              </div>
              <div className="h-[1px] bg-gray-300 dark:bg-gray-700 flex-1" />
            </motion.div>
          )}
        </AnimatePresence>
        {messages.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-center h-full min-h-[45vh]"
          >
            <div className="text-center space-y-4 max-w-sm p-6">
              <motion.div 
                initial={{ scale: 0.7, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
                className="w-16 h-16 bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm"
              >
                <Bot className="w-8 h-8" />
              </motion.div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{t('what_can_i_help', '有什么我可以帮您的？')}</h2>

            </div>
          </motion.div>
        )}

        {/* Pinned Messages Section */}
        {messages.some(m => m.isPinned) && (
          <div className="mb-6 sticky top-0 z-10 no-print">
            <div className="bg-gray-50/90 dark:bg-[#2c2c2e]/90 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
              <button 
                onClick={() => setIsPinnedCollapsed(!isPinnedCollapsed)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#3a3a3c] transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <Pin className="w-3.5 h-3.5 fill-current" />
                  <span>{t('pinned_messages_count', '已固定消息')} ({messages.filter(m => m.isPinned).length})</span>
                </div>
                {isPinnedCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              
              <AnimatePresence>
                {!isPinnedCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-2 space-y-1">
                      {messages.filter(m => m.isPinned).map(msg => (
                        <div key={`pinned-${msg.id}`} className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-[#1c1c1e] rounded-xl border border-gray-100 dark:border-gray-800/50 group">
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <Bot className={`w-4 h-4 shrink-0 ${msg.role === 'assistant' ? 'text-brand dark:text-brand-dark' : 'text-gray-400'}`} />
                            <div className="truncate text-sm text-gray-700 dark:text-gray-300">
                              {msg.content}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                const el = document.getElementById(`msg-${msg.id}`);
                                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-brand transition-colors cursor-pointer"
                              title={t('view_in_chat', '在聊天中查看')}
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onTogglePin(msg.id)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                              title={t('unpin_message', '取消固定')}
                            >
                              <PinOff className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
        
        <AnimatePresence initial={false}>
          {pyodideProgress && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center p-4 sticky top-0 z-30"
            >
              <div className="bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-md border border-brand/20 dark:border-brand-dark/20 rounded-2xl p-4 shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-brand animate-pulse" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{pyodideProgress.message}</span>
                  </div>
                  <span className="text-xs font-bold text-brand">{pyodideProgress.percent}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-brand dark:bg-brand-dark"
                    initial={{ width: 0 }}
                    animate={{ width: `${pyodideProgress.percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {messages.map((msg, index) => {
            const hasVersions = msg.role === 'assistant' && msg.versions && msg.versions.length > 1;
            const currentVersionIndex = msg.currentVersionIndex ?? 0;
            const displayContent = hasVersions && msg.versions ? msg.versions[currentVersionIndex].content : msg.content;
            const displayToolCalls = hasVersions && msg.versions ? msg.versions[currentVersionIndex].tool_calls : msg.tool_calls;
            const displayError = hasVersions && msg.versions ? msg.versions[currentVersionIndex].error : msg.error;

            // 1. 寻找该消息中工具调用的对应结果以及后续的助手回复，并保持顺序
            const getTurnBlocks = () => {
              const blocks: any[] = [];
              const toolResults: Record<string, string> = {};
              
              const addMessageBlocks = (m: any, isFirst: boolean) => {
                const messageBlocks = (isFirst && hasVersions && m.versions) 
                  ? m.versions[currentVersionIndex].blocks 
                  : m.blocks;
                
                const content = (isFirst && hasVersions && m.versions) 
                  ? m.versions[currentVersionIndex].content 
                  : m.content;
                const tool_calls = (isFirst && hasVersions && m.versions) 
                  ? m.versions[currentVersionIndex].tool_calls 
                  : m.tool_calls;

                // If message has blocks from streaming, use them directly
                if (messageBlocks && messageBlocks.length > 0) {
                  for (const b of messageBlocks) {
                    if (b.type === 'text') {
                      const { thought, rest } = parseThought(b.content || '');
                      if (thought) blocks.push({ type: 'thought', content: thought });
                      if (rest && rest.trim()) blocks.push({ type: 'text', content: rest });
                    } else if (b.type === 'tool_call') {
                      blocks.push({ type: 'tool_call', tool_call: b.tool_call, tcId: b.tcId || `${m.id}-tc-${b.tool_call?.id || ''}` });
                    }
                  }
                } else {
                  // Fallback: reconstruct from content + tool_calls
                  const { thought, rest } = parseThought(content || '');
                  if (thought) blocks.push({ type: 'thought', content: thought });
                  if (rest && rest.trim()) blocks.push({ type: 'text', content: rest });
                  if (tool_calls && tool_calls.length > 0) {
                    tool_calls.forEach((tc: any, i: number) => {
                      blocks.push({ type: 'tool_call', tool_call: tc, tcId: `${m.id}-tc-${i}` });
                    });
                  }
                }
              };

              addMessageBlocks(msg, true);

              // 从当前消息之后开始查找，直到遇到下一个用户消息
              for (let i = index + 1; i < messages.length; i++) {
                const m = messages[i];
                if (m.role === 'user') break;
                
                if (m.role === 'tool') {
                  toolResults[m.tool_call_id || ''] = m.content;
                } else if (m.role === 'assistant') {
                  addMessageBlocks(m, false);
                }
              }
              return { blocks, toolResults };
            };

            // 2. 隐藏非首个助手消息和工具消息
            // 规则：如果当前是助手消息，且上一个消息也是助手或工具消息，则不独立渲染（除非它是这一轮的首个回复）
            const isFirstAssistantInTurn = msg.role === 'assistant' && (index === 0 || messages[index - 1].role === 'user');
            
            if (msg.role === 'tool' || (msg.role === 'assistant' && !isFirstAssistantInTurn)) {
              return null;
            }

            const { blocks, toolResults } = getTurnBlocks();
            const allToolCalls = blocks.filter(b => b.type === 'tool_call').map(b => b.tool_call);
            const filteredToolCalls = allToolCalls.filter((tc: any) => tc.function.name !== 'update_memory');
            const hasText = blocks.some(b => b.type === 'text');
            const hasThought = blocks.some(b => b.type === 'thought');
            
            // 如果只有 update_memory 且没有内容，依然隐藏
            if (msg.role === 'assistant' && !hasText && !hasThought && filteredToolCalls.length === 0 && allToolCalls.length > 0) {
              return null;
            }

            if (msg.isCompressedSummary) {
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id}
                  id={`msg-${msg.id}`}
                  className="w-full my-4 flex flex-col items-center"
                >
                  {/* 中央“已压缩对话”灰字线标 */}
                  <div className="flex items-center justify-center my-3 gap-3 w-full max-w-md select-none">
                    <div className="h-[1px] bg-gray-200 dark:bg-gray-800 flex-1" />
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800/80 border border-gray-200/60 dark:border-gray-700/60 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span>{t('compressed_chat', '已压缩对话')}</span>
                    </div>
                    <div className="h-[1px] bg-gray-200 dark:bg-gray-800 flex-1" />
                  </div>

                  <div className="w-full bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl p-4 sm:p-5 shadow-sm backdrop-blur-md">
                    <div className="flex items-center justify-between mb-3 border-b border-amber-200/60 dark:border-amber-800/60 pb-2.5">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                        <Zap className="w-4 h-4 fill-amber-500 text-amber-500" />
                        <span>{t('context_summary_title', '📦 历史对话冷区上下文压缩摘要')}</span>
                      </div>
                      <span className="text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700">
                        {t('cold_zone_extracted', '冷区已结构化提炼')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed font-sans prose dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkMath]} 
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={{
                          p: ({ children }: any) => <div className="mb-2 last:mb-0">{children}</div>
                        }}
                      >
                        {displayContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              );
            }

            if (msg.isCompressedSummaryReply) {
              return (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id}
                  id={`msg-${msg.id}`}
                  className="flex items-center justify-center gap-2 my-2 px-3 py-1 bg-gray-100 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/50 rounded-full text-[11px] text-gray-500 dark:text-gray-400 w-fit mx-auto shadow-xs select-none"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{displayContent}</span>
                </motion.div>
              );
            }

            return (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ 
                duration: 0.4,
                ease: [0.2, 0.8, 0.2, 1]
              }}
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`flex items-start gap-4 group ${
                msg.role === 'user' ? 'flex-row-reverse' : ''
              }`}
            >
              <div className={`flex flex-col gap-1 max-w-[95%] md:max-w-[90%] lg:max-w-[85%] xl:max-w-[80%] min-w-0 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`px-5 py-4 rounded-[24px] shadow-sm relative overflow-hidden min-w-0 max-w-full ${
                    msg.role === 'user'
                      ? 'bg-brand dark:bg-brand-dark text-white rounded-tr-sm'
                      : (msg.role as string) === 'tool'
                      ? 'bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs border border-gray-200 dark:border-gray-800 rounded-tl-sm py-2 px-3'
                      : 'bg-white dark:bg-[#1c1c1e] text-gray-900 dark:text-gray-100 border border-gray-100/50 dark:border-gray-800/50 rounded-tl-sm'
                  }`}
                >
                  {(msg.role as string) === 'tool' ? (
                    <div 
                      className="flex flex-col gap-1 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors rounded-lg p-1 -m-1"
                      onClick={() => toggleExpandedToolCall(msg.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-0.5">
                          <Wrench className="w-2.5 h-2.5" />
                          <span>工具响应: {msg.name}</span>
                        </div>
                        {expandedToolCalls.has(msg.id) ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                      </div>
                      <div className="font-mono text-[11px] leading-relaxed break-all opacity-80">
                        {expandedToolCalls.has(msg.id) ? (
                          <div className="space-y-3 mt-1">
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-3 mt-1">
                                {msg.attachments.map(at => (
                                  <FileCard 
                                    key={at.id} 
                                    at={at} 
                                    isSmall 
                                    onEnlarge={(url) => setLightboxUrl(url)}
                                    onReference={(attachment) => {
                                      setAttachments(prev => {
                                        if (prev.some(a => a.url === attachment.url)) return prev;
                                        return [...prev, { ...attachment, id: crypto.randomUUID() }];
                                      });
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                            <pre className="whitespace-pre-wrap p-3 bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto font-mono text-xs">
                              {displayContent}
                            </pre>
                          </div>
                        ) : (
                          displayContent.length > 100 ? `${displayContent.slice(0, 100)}...` : displayContent
                        )}
                      </div>
                    </div>
                  ) : msg.role === 'user' ? (
                    <div className="space-y-3">
                     {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-3 mb-2">
                          {msg.attachments.map(at => (
                            <FileCard 
                              key={at.id} 
                              at={at} 
                              isUser 
                              onEnlarge={(url) => setLightboxUrl(url)}
                            />
                          ))}
                        </div>
                      )}
                      <div 
                        className="whitespace-pre-wrap break-words [word-break:break-word]"
                        onDoubleClick={() => {
                          setEditingMessageId(msg.id);
                          setEditingContent(displayContent);
                        }}
                      >
                        {editingMessageId === msg.id ? (
                          <div className="flex flex-col gap-2 min-w-[240px] sm:min-w-[320px]">
                            <textarea
                              autoFocus
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                  handleSaveEdit();
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit();
                                }
                              }}
                              className="w-full bg-white/10 text-white border border-white/20 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 resize-none min-h-[80px]"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white transition-colors cursor-pointer"
                              >
                                {t('cancel', '取消')}
                              </button>
                              <button
                                onClick={handleSaveEdit}
                                className="px-4 py-1.5 bg-white text-brand font-bold text-xs rounded-lg hover:bg-white/90 transition-colors cursor-pointer shadow-sm"
                              >
                                {t('save_and_regenerate', '保存并重新生成')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          displayContent
                        )}
                      </div>
                    </div>
                ) : (
                  <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-transparent prose-pre:p-0 prose-pre:rounded-[12px] prose-a:text-brand dark:prose-a:text-brand-dark break-words [word-break:break-word]
                    prose-p:text-gray-900 dark:prose-p:text-gray-100 
                    prose-headings:text-gray-900 dark:prose-headings:text-white prose-headings:font-semibold
                    prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-bold
                    prose-li:text-gray-900 dark:prose-li:text-gray-100
                    prose-blockquote:text-gray-900 dark:prose-blockquote:text-gray-100 prose-blockquote:font-medium
                    prose-blockquote:border-l-brand dark:prose-blockquote:border-l-brand-dark
                    prose-th:text-gray-900 dark:prose-th:text-white prose-th:bg-gray-50 dark:prose-th:bg-gray-800/50 prose-th:px-4 prose-th:py-2 prose-th:border prose-th:border-gray-200 dark:prose-th:border-gray-700
                    prose-td:text-gray-800 dark:prose-td:text-gray-200 prose-td:px-4 prose-td:py-2 prose-td:border prose-td:border-gray-200 dark:prose-td:border-gray-700
                    prose-table:border-collapse prose-table:border prose-table:border-gray-200 dark:prose-table:border-gray-700 prose-table:rounded-xl prose-table:overflow-hidden">
                    {/* 1. 附件展示 (保持在最上方) */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-3 mb-4">
                        {msg.attachments.map(at => (
                          <FileCard 
                            key={at.id} 
                            at={at} 
                            onReference={(attachment) => {
                              setAttachments(prev => {
                                if (prev.some(a => a.url === attachment.url)) return prev;
                                return [...prev, { ...attachment, id: crypto.randomUUID() }];
                              });
                            }}
                            onEnlarge={(url) => setLightboxUrl(url)}
                          />
                        ))}
                      </div>
                    )}

                    {/* 2. 动态内容流: 按逻辑顺序展示 思考 -> 工具 -> 文字 */}
                    {blocks.length > 0 ? (
                      <div className="flex flex-col gap-4">
                        {blocks.map((block, i) => {
                          if (block.type === 'thought') {
                            return (
                              <ThoughtBlock 
                                key={`thought-${i}`}
                                content={block.content} 
                                onRun={(code, lang) => setRunnerState({ isOpen: true, code, language: lang, autoRun: true })}
                                onFullScreen={(code, lang) => setRunnerState({ isOpen: true, code, language: lang, autoRun: false })}
                                theme={theme}
                                onEnlarge={(url) => setLightboxUrl(url)}
                                onReference={(code) => {
                                  setAttachments(prev => {
                                    const newId = crypto.randomUUID();
                                    return [...prev, {
                                      id: newId,
                                      name: 'mindmap.mmd',
                                      type: 'text/x-mermaid',
                                      url: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(code)))}`,
                                      size: code.length
                                    }];
                                  });
                                }}
                              />
                            );
                          }

                          if (block.type === 'tool_call') {
                            const tc = block.tool_call;
                            if (tc.function.name === 'update_memory') return null;
                            
                            const tcId = block.tcId;
                            const isExpanded = expandedToolCalls.has(tcId);
                            const result = toolResults[tc.id];

                            return (
                              <motion.div 
                                key={`tc-${i}`} 
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
                              >
                                <div 
                                  className="flex flex-col gap-2 px-3 py-2 text-xs text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                  onClick={() => toggleExpandedToolCall(tcId)}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                      <Wrench className={`w-3 h-3 ${!isStreaming ? '' : 'animate-spin-slow'}`} />
                                      <span>调用工具: <span className="font-mono text-brand dark:text-brand-dark">{tc.function.name}</span></span>
                                    </div>
                                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </div>
                                  {isExpanded && (
                                    <div className="mt-1 space-y-2">
                                      <div className="font-mono text-[11px] p-2.5 bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 rounded-md overflow-x-auto border border-gray-200 dark:border-gray-700">
                                        <div className="text-gray-500 dark:text-gray-400 mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider">参数:</div>
                                        {typeof tc.function.arguments === 'string' 
                                          ? tc.function.arguments 
                                          : JSON.stringify(tc.function.arguments, null, 2)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                
                                {/* 工具执行结果 */}
                                {isExpanded && result && (
                                  <div className="px-3 py-2 bg-gray-100/80 dark:bg-black/40 border-t border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-2 mb-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      执行结果
                                    </div>
                                    <div className="font-mono text-[11px] text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words overflow-x-auto max-h-[300px]">
                                      {result}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            );
                          }

                          if (block.type === 'text') {
                            return (
                              <motion.div 
                                key={`text-${i}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.4 }}
                              >
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkMath]}
                                  rehypePlugins={[rehypeRaw, rehypeKatex]}
                                  components={{
                                    p: ({ children }: any) => <div className="mb-4 last:mb-0">{children}</div>,
                                    a({ node, href, children, ...props }: any) {
                                      return <MediaDownloadLink href={href} {...props}>{children}</MediaDownloadLink>;
                                    },
                                    code({ node, inline, className, children, ...props }: any) {
                                      const match = /language-(\w+)/.exec(className || '');
                                      const lang = match ? match[1] : '';
                                      if (!inline && lang === 'mermaid') {
                                        return <Mermaid 
                                          chart={String(children).replace(/\n$/, '')} 
                                          onEnlarge={(url) => setLightboxUrl(url)}
                                          onReference={(code) => {
                                            setAttachments(prev => {
                                              const newId = crypto.randomUUID();
                                              return [...prev, {
                                                id: newId,
                                                name: 'mindmap.mmd',
                                                type: 'text/x-mermaid',
                                                url: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(code)))}`,
                                                size: code.length
                                              }];
                                            });
                                          }}
                                        />;
                                      }
                                      return !inline ? (
                                        <CodeBlock 
                                          language={lang} 
                                          onRun={(code, lang) => setRunnerState({ isOpen: true, code, language: lang, autoRun: true })}
                                          onFullScreen={(code, lang) => setRunnerState({ isOpen: true, code, language: lang, autoRun: false })}
                                          theme={theme}
                                        >
                                          {children}
                                        </CodeBlock>
                                      ) : (
                                        <code {...props} className={`${className || ''} bg-gray-100 dark:bg-gray-800/60 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded-md font-mono text-[13px] border border-gray-200/50 dark:border-gray-700/50 break-words [word-break:break-word]`}>
                                          {children}
                                        </code>
                                      );
                                    },
                                    img({ node, ...props }: any) {
                                      return <ImageWithActions setLightboxUrl={setLightboxUrl} setAttachments={setAttachments} {...props} />;
                                    }
                                  }}
                                >
                                  {block.content}
                                </ReactMarkdown>
                              </motion.div>
                            );
                          }
                          return null;
                        })}
                        
                        {displayError && (
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-xl text-red-700 dark:text-red-400 text-sm flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <div className="whitespace-pre-wrap break-words [word-break:break-word] font-medium">{displayError}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* 加载状态占位 */
                      isStreaming && index === messages.length - 1 && (
                        <div className="flex items-center gap-2 h-6">
                           <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                           <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                           <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )
                    )}
                  </div>
                )}
                </div>
                
                {/* Customizable Message Bubble Toolbar */}
                {displayContent && (
                  <ChatMessageToolbar
                    messageId={msg.id}
                    role={msg.role}
                    content={displayContent}
                    isStreaming={isStreaming}
                    isPinned={msg.isPinned}
                    speakingId={speakingId}
                    copiedId={copiedId}
                    currentVersionIndex={currentVersionIndex}
                    totalVersions={msg.versions?.length || 1}
                    bubbleToolsConfig={bubbleToolsConfig}
                    onCopy={handleCopy}
                    onRegenerate={onRegenerate}
                    onSpeak={handleSpeak}
                    onBranch={onBranchChat}
                    onTogglePin={onTogglePin}
                    onDelete={onDeleteMessage}
                    onEdit={(id) => {
                      setEditingMessageId(id);
                      setEditingContent(displayContent);
                    }}
                    onSwitchVersion={onSwitchVersion}
                  />
                )}
              </div>
            </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {/* Scroll to Bottom Button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-32 right-8 p-3 bg-white dark:bg-[#2c2c2e] text-gray-600 dark:text-gray-300 rounded-full shadow-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-[#3a3a3c] transition-all z-20 active:scale-95 no-print"
            title="滚动到底部"
          >
            <ArrowDown className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating Input Area */}
      <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none p-3 sm:p-4 pb-4 sm:pb-8 flex justify-center">
        <div className="max-w-5xl w-full pointer-events-auto">
          <ChatInput 
            onSendMessage={onSendMessage}
            isStreaming={isStreaming}
            onStopGeneration={onStopGeneration}
            input={input}
            setInput={setInput}
            attachments={attachments}
            setAttachments={setAttachments}
            isListening={isListening}
            setIsListening={setIsListening}
            recognitionRef={recognitionRef}
            fileInputRef={fileInputRef}
            onCompressChat={onCompressChat}
            isCompressing={isCompressing}
            settings={settings}
            onOpenVFS={onOpenVFS}
            onPreviewAttachment={(attachment) => {
              if (attachment.type.startsWith('image/')) {
                setLightboxUrl(attachment.url);
              } else {
                // For other files, use VFS Modal to preview if it was saved to VFS
                const path = attachment.vfsPath || `/attachments/${attachment.name}`;
                window.dispatchEvent(new CustomEvent('open-vfs-preview', { detail: path }));
              }
            }}
          />
        </div>
      </div>
      <ImageLightbox 
        url={lightboxUrl} 
        isOpen={!!lightboxUrl} 
        onClose={() => setLightboxUrl(null)} 
      />
      <CodeRunnerModal
        isOpen={runnerState.isOpen}
        onClose={() => setRunnerState({ ...runnerState, isOpen: false })}
        code={runnerState.code}
        language={runnerState.language}
        autoRun={runnerState.autoRun}
      />
    </div>
  );
}
