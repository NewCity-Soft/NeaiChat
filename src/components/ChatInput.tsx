import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Image, FileText, Zap, MicOff, Mic, Square, Send, Volume2, Play, X as XIcon, Paperclip, HardDrive } from 'lucide-react';
import { Attachment, AppSettings } from '../types';
import { fileToVFS } from '../utils/vfs';
import { useTranslation } from '../i18n';

import { LLMEngine } from '../services/llm-engine';
import { SpeechService, SpeechSupportMode } from '../services/speech-service';

interface ChatInputProps {
  onSendMessage: (content: string, attachments?: Attachment[]) => void;
  isStreaming: boolean;
  onStopGeneration: () => void;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  isListening: boolean;
  setIsListening: React.Dispatch<React.SetStateAction<boolean>>;
  recognitionRef: React.RefObject<any>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onCompressChat?: () => void;
  isCompressing?: boolean;
  settings?: AppSettings;
  onOpenVFS?: () => void;
  onPreviewAttachment?: (attachment: Attachment) => void;
}

export const ChatInput = ({ 
  onSendMessage, 
  isStreaming, 
  onStopGeneration, 
  input,
  setInput,
  attachments,
  setAttachments,
  isListening,
  setIsListening,
  recognitionRef,
  fileInputRef,
  onCompressChat,
  isCompressing,
  settings,
  onOpenVFS,
  onPreviewAttachment
}: ChatInputProps) => {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [speechMode, setSpeechMode] = useState<SpeechSupportMode | null>(null);
  const [isMicVisible, setIsMicVisible] = useState(true);

  useEffect(() => {
    const mode = settings?.voiceButtonMode || 'auto';
    if (mode === 'on') {
      setIsMicVisible(true);
    } else if (mode === 'off') {
      setIsMicVisible(false);
    } else {
      // Auto mode
      if (speechMode === 'none') {
        setIsMicVisible(false);
      } else {
        setIsMicVisible(true);
      }
    }
  }, [settings?.voiceButtonMode, speechMode]);

  useEffect(() => {
    if (speechMode === 'local' && !window.sessionStorage.getItem('local_engine_notified')) {
      alert('检测到当前 API 不支持语音输入，已为您切换至本地语音识别模式。');
      window.sessionStorage.setItem('local_engine_notified', 'true');
    }
  }, [speechMode]);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const mode = await SpeechService.detectSupport(settings);
      if (mounted) {
        setSpeechMode(mode);
      }
    };
    check();
    return () => { mounted = false; };
  }, [settings?.apiUrl, settings?.apiKey, settings?.model]);

  // Auto-resize logic: adjust height based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      if (!input) {
        textarea.style.height = '40px';
      } else {
        textarea.style.height = 'auto';
        const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 240); // Max height 240px
        textarea.style.height = `${newHeight}px`;
      }
    }
  }, [input]);

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;
    onSendMessage(input.trim(), attachments.length > 0 ? attachments : undefined);
    setInput('');
    setAttachments([]);
  };

  const handleCompress = () => {
    if (onCompressChat) {
      onCompressChat();
    } else {
      onSendMessage("请对目前为止的对话进行简明要点总结，提取核心信息以压缩对话上下文。");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newAttachments: Attachment[] = [];
    for (const file of files) {
      const reader = new FileReader();
      const promise = new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      const url = await promise;
      newAttachments.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        url,
        size: file.size,
        vfsPath: `/attachments/${file.name}`
      });

      // 同步存入虚拟文件系统 (VFS) 备份，方便工具后续调用
      fileToVFS(file, `/attachments/${file.name}`).catch(err => {
        console.warn('Failed to sync attachment to VFS:', err);
      });
    }

    setAttachments(prev => [...prev, ...newAttachments]);
    if (e.target) e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaChunks = useRef<Blob[]>([]);

  const toggleListening = async () => {
    if (isListening) {
      if (speechMode === 'local' && recognitionRef.current) {
        recognitionRef.current.stop();
      } else if (recognitionRef.current && recognitionRef.current.state !== 'inactive') {
        recognitionRef.current.stop();
      }
      return;
    }

    if (speechMode === 'none') {
      alert('当前环境不支持任何语音输入方式（三方API不支持，且无本地语音识别支持），语音功能将禁用。');
      setSpeechMode('none');
      return;
    }

    if (speechMode === 'local') {
      const recognition = SpeechService.getLocalRecognition();
      if (!recognition) {
        alert('本地语音识别引擎不可用，语音功能将被禁用。');
        setSpeechMode('none');
        return;
      }
      
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => (result as any)[0])
          .map((result: any) => result.transcript)
          .join('');
        setInput(transcript);
      };
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);
      
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {
        console.error('Failed to start local recognition:', e);
      }
      return;
    }

    if (!settings) {
      alert('无法获取配置信息，请检查设置。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const mimeType = mediaRecorder.mimeType || 'audio/webm';
      mediaChunks.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          mediaChunks.current.push(e.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsListening(true);
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        stream.getTracks().forEach(track => track.stop());
        
        if (mediaChunks.current.length === 0) return;
        
        const audioBlob = new Blob(mediaChunks.current, { type: mimeType });
        setIsTranscribing(true);
        const originalInput = input;
        setInput(prev => prev + (prev ? ' ' : '') + '正在转换语音...');
        
        try {
          const text = await LLMEngine.transcribeAudio(audioBlob, settings);
          setInput(prev => {
            const loadingText = '正在转换语音...';
            if (prev.includes(loadingText)) {
              return prev.replace(loadingText, text ? text : '');
            }
            return prev + (prev ? ' ' : '') + (text || '');
          });
        } catch (e: any) {
          console.error('Audio transcription error:', e);
          if (SpeechService.hasLocalSupport()) {
            alert('云端语音转文字失败: ' + e.message + '\n将为您切换至本地语音识别 API。');
            setSpeechMode('local');
          } else {
            alert('语音转文字失败: ' + e.message + '\n您的设备不支持本地语音识别，语音功能将被禁用。');
            setSpeechMode('none');
          }
          setInput(prev => prev.replace('正在转换语音...', ''));
        } finally {
          setIsTranscribing(false);
        }
      };

      recognitionRef.current = mediaRecorder;
      mediaRecorder.start(100); // collect data every 100ms
    } catch (e) {
      console.error('Failed to start microphone:', e);
      alert('无法启动麦克风，请检查权限。');
    }
  };

  return (
    <div className="w-full relative">
      <div className="relative w-full mx-auto flex flex-col bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-2xl backdrop-saturate-150 border border-gray-200/40 dark:border-gray-800/40 rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-300">
        
        {/* Attachments Preview */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-wrap gap-3 p-4 pb-0 overflow-hidden rounded-t-[28px]"
            >
              {attachments.map(at => (
                <div 
                  key={at.id} 
                  className="relative group cursor-pointer"
                  onClick={() => onPreviewAttachment?.(at)}
                >
                  {at.type.startsWith('image/') ? (
                    <div className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 relative shadow-sm">
                      <img src={at.url} alt={at.name} className="w-full h-full object-cover" />
                    </div>
                  ) : at.type.startsWith('audio/') ? (
                    <div className="w-20 h-20 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center p-2 text-center shadow-sm">
                      <Volume2 className="w-6 h-6 text-brand dark:text-brand-dark mb-1" />
                      <span className="text-[10px] text-gray-500 truncate w-full">{at.name}</span>
                    </div>
                  ) : at.type.startsWith('video/') ? (
                    <div className="w-20 h-20 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center p-2 text-center shadow-sm">
                      <Play className="w-6 h-6 text-brand dark:text-brand-dark mb-1" />
                      <span className="text-[10px] text-gray-500 truncate w-full">{at.name}</span>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center p-2 text-center shadow-sm">
                      <FileText className="w-6 h-6 text-gray-400 mb-1" />
                      <span className="text-[10px] text-gray-500 truncate w-full">{at.name}</span>
                    </div>
                  )}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAttachment(at.id);
                    }}
                    className="absolute -top-1.5 -right-1.5 bg-gray-900/80 text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-1.5 p-1.5 sm:p-2 relative">
          {/* File Input for general files */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            multiple 
            className="hidden" 
            accept="*/*"
          />
          {/* File Input specifically for images */}
          <input 
            type="file" 
            ref={imageInputRef} 
            onChange={handleFileSelect} 
            multiple 
            className="hidden" 
            accept="image/*"
          />

          {/* Action Menu Popover */}
          <AnimatePresence>
            {isMenuOpen && (
              <>
                {/* Overlay Backdrop to dismiss menu */}
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setIsMenuOpen(false)} 
                />
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute bottom-full left-1 mb-3 z-40 w-72 bg-white/95 dark:bg-[#2c2c2e]/95 backdrop-blur-2xl border border-gray-200/60 dark:border-gray-700/60 rounded-2xl p-3 shadow-2xl overflow-hidden"
                >
                  {/* 顶部突出并列展示：上传文件 & 上传图片 */}
                  <div className="grid grid-cols-2 gap-2 mb-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        fileInputRef.current?.click();
                        setIsMenuOpen(false);
                      }}
                      className="flex flex-col items-center justify-center p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200/60 dark:border-blue-800/40 text-blue-600 dark:text-blue-400 transition-all active:scale-95 group cursor-pointer"
                    >
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/60 mb-1.5 group-hover:scale-110 transition-transform">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-semibold">{t('upload_file', '上传文件')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        imageInputRef.current?.click();
                        setIsMenuOpen(false);
                      }}
                      className="flex flex-col items-center justify-center p-3 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200/60 dark:border-purple-800/40 text-purple-600 dark:text-purple-400 transition-all active:scale-95 group cursor-pointer"
                    >
                      <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/60 mb-1.5 group-hover:scale-110 transition-transform">
                        <Image className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-semibold">{t('upload_image', '上传图片')}</span>
                    </button>
                  </div>

                  {/* 快捷选项列表 */}
                  <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-gray-800/80">
                    {onOpenVFS && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenVFS();
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-200 transition-colors text-left group cursor-pointer"
                      >
                        <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40 group-hover:scale-105 transition-transform">
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-gray-800 dark:text-gray-100">
                            {t('vfs_title', '虚拟文件系统 (VFS)')}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('vfs_desc', '保存管理文件，不注入上下文')}</span>
                        </div>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isCompressing}
                      onClick={() => {
                        handleCompress();
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/80 text-gray-700 dark:text-gray-200 transition-colors text-left group cursor-pointer disabled:opacity-50"
                    >
                      <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40 group-hover:scale-105 transition-transform">
                        <Zap className={`w-4 h-4 ${isCompressing ? 'animate-spin' : ''}`} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-100">
                          {isCompressing ? t('compress_history', '正在压缩历史...') : t('compress_chat', '压缩对话')}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('compress_desc', '拆分冷热数据，生成结构化摘要')}</span>
                      </div>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* 加号按钮 */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`shrink-0 w-10 h-10 rounded-full transition-colors flex items-center justify-center cursor-pointer ${
              isMenuOpen 
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100' 
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title={t('more_actions', '更多操作')}
          >
            <Plus className={`w-5 h-5 transition-transform duration-200 ${isMenuOpen ? 'rotate-45' : ''}`} />
          </motion.button>
          {isMicVisible && (
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={toggleListening}
              className={`shrink-0 w-10 h-10 rounded-full transition-colors flex items-center justify-center cursor-pointer ${
                isListening 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title={isListening ? t('stop_voice_input', '停止语音输入') : t('voice_input', '语音输入')}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </motion.button>
          )}
          <textarea
            rows={1}
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              isListening 
                ? (speechMode === 'local' ? t('listening_local', '本地语音识别中...') : t('listening', '正在倾听...')) 
                : (isTranscribing ? t('transcribing', '语音转换中...') : (speechMode === 'local' ? t('input_local_voice', '输入消息 (本地语音模式)...') : t('input_placeholder', '输入消息...')))
            }
            className="flex-1 max-h-[240px] min-h-[40px] bg-transparent resize-none py-2 px-2.5 focus:outline-none text-gray-900 dark:text-gray-100 transition-[height] duration-200 ease-out leading-[24px] text-sm sm:text-base overflow-hidden hover:overflow-y-auto custom-scrollbar"
          />
          {isStreaming ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={onStopGeneration}
              className="shrink-0 w-10 h-10 bg-gray-500 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-500 text-white rounded-full transition-colors flex items-center justify-center cursor-pointer"
            >
              <Square className="w-5 h-5 fill-current" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileHover={(!input.trim() && attachments.length === 0) ? {} : { scale: 1.05 }}
              whileTap={(!input.trim() && attachments.length === 0) ? {} : { scale: 0.92 }}
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
              className="shrink-0 w-10 h-10 bg-brand dark:bg-brand-dark hover:opacity-90 disabled:opacity-40 text-white rounded-full transition-colors flex items-center justify-center cursor-pointer"
            >
              <Send className="w-5 h-5" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};
