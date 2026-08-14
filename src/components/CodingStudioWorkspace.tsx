import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef, useRef } from 'react';
import { 
  Plus, 
  FileCode, 
  Save, 
  Sparkles, 
  Terminal, 
  Check, 
  Copy, 
  Eye, 
  X,
  Edit3,
  HardDrive,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Chat, CodingProject, Attachment, AppSettings } from '../types';
import { VFSItem } from '../utils/vfs';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatInput } from './ChatInput';
import { ImageLightbox } from './ImageLightbox';
import { playAIMorseCodeChime } from '../utils/explicit-watermark';
import { VFSTreeExplorer } from './VFSTreeExplorer';
import { UnifiedCodeEditor } from './UnifiedCodeEditor';
import { customConfirm, customAlert } from '../services/dialogService';

export interface CodingStudioWorkspaceRef {
  refreshPreview: () => void;
  exportHTML: () => void;
}

interface CodingStudioWorkspaceProps {
  chat: Chat;
  project: CodingProject;
  onUpdateProjectVFS: (updatedFiles: VFSItem[]) => void;
  onSendMessage: (text: string, attachments?: Attachment[]) => void;
  isStreaming: boolean;
  onStopGeneration?: () => void;
  onResetProject: () => void;
  settings?: AppSettings;
  theme?: 'light' | 'dark';
  onTogglePin?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, content: string) => void;
  onSwitchVersion?: (messageId: string, versionIndex: number) => void;
  onDeleteMessage?: (messageId: string) => void;
  onBranchChat?: (messageId: string) => void;
  onCompressChat?: () => void;
  isCompressing?: boolean;
  onOpenVFS?: () => void;
}

export const CodingStudioWorkspace = forwardRef<
  CodingStudioWorkspaceRef,
  CodingStudioWorkspaceProps
>(({
  chat,
  project,
  onUpdateProjectVFS,
  onSendMessage,
  isStreaming,
  onStopGeneration,
  onResetProject,
  settings,
  theme = 'light',
  onTogglePin,
  onRegenerate,
  onEditMessage,
  onSwitchVersion,
  onDeleteMessage,
  onBranchChat,
  onCompressChat,
  isCompressing,
  onOpenVFS
}, ref) => {
  // VFS Files State
  const [files, setFiles] = useState<VFSItem[]>(project.vfsFiles || []);
  const [activeFilePath, setActiveFilePath] = useState<string>('/index.html');
  
  // Editor View Mode State
  const [editorContent, setEditorContent] = useState('');
  const [isModified, setIsModified] = useState(false);
  const [editorViewMode, setEditorViewMode] = useState<'edit' | 'highlight'>('edit');
  
  // Mobile/Desktop Navigation Active Tabs
  const [activeRightTab, setActiveRightTab] = useState<'preview' | 'editor'>('preview');
  const [mobileTab, setMobileTab] = useState<'chat' | 'editor' | 'preview'>('preview');

  // Preview & Console State
  const [previewKey, setPreviewKey] = useState(0);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<{ id: string; type: string; message: string; timestamp: number }[]>([]);

  // Add File Dialog & Explorer State
  const [showTreeExplorer, setShowTreeExplorer] = useState(true);
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Chat Input & Media State
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages, isStreaming]);

  // Handle Speech playback
  const handleSpeakMessage = async (id: string, text: string) => {
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    setSpeakingId(id);
    await playAIMorseCodeChime();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utterance);
  };

  // Sync prop vfsFiles to state if external update
  useEffect(() => {
    if (project.vfsFiles) {
      setFiles(project.vfsFiles);
      if (!project.vfsFiles.some(f => f.path === activeFilePath)) {
        setActiveFilePath(project.vfsFiles[0]?.path || '/index.html');
      }
    }
  }, [project.vfsFiles]);

  // Load content when active file changes
  const activeFile = useMemo(() => {
    return files.find(f => f.path === activeFilePath) || files[0];
  }, [files, activeFilePath]);

  useEffect(() => {
    if (activeFile) {
      setEditorContent(activeFile.content);
      setIsModified(false);
    }
  }, [activeFile]);

  // Save current active file
  const handleSaveFile = () => {
    if (!activeFile) return;
    const updated = files.map(f => f.id === activeFile.id ? { ...f, content: editorContent, updatedAt: Date.now() } : f);
    setFiles(updated);
    onUpdateProjectVFS(updated);
    setIsModified(false);
    setPreviewKey(prev => prev + 1);
  };

  // Create new file in VFS
  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    let cleanName = newFileName.trim();
    if (!cleanName.startsWith('/')) cleanName = '/' + cleanName;

    if (files.some(f => f.path === cleanName)) {
      await customAlert('同名文件已存在', { title: '提示' });
      return;
    }

    const ext = cleanName.split('.').pop() || '';
    let mimeType = 'text/plain';
    if (ext === 'html') mimeType = 'text/html';
    else if (ext === 'css') mimeType = 'text/css';
    else if (ext === 'js') mimeType = 'text/javascript';
    else if (ext === 'json') mimeType = 'application/json';

    const newFile: VFSItem = {
      id: crypto.randomUUID(),
      path: cleanName,
      name: cleanName.replace(/^\//, ''),
      type: mimeType,
      size: 0,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [...files, newFile];
    setFiles(updated);
    onUpdateProjectVFS(updated);
    setActiveFilePath(newFile.path);
    setNewFileName('');
    setIsAddingFile(false);
  };

  // Delete file from VFS
  const handleDeleteFile = async (pathToDelete: string) => {
    if (files.length <= 1) {
      await customAlert('至少需要保留一个主入口文件', { title: '提示' });
      return;
    }
    if (!(await customConfirm(`确定要删除文件 ${pathToDelete} 吗？`, { title: '确认删除' }))) return;

    const updated = files.filter(f => f.path !== pathToDelete);
    setFiles(updated);
    onUpdateProjectVFS(updated);
    if (activeFilePath === pathToDelete) {
      setActiveFilePath(updated[0]?.path || '');
    }
    setPreviewKey(prev => prev + 1);
  };

  // Create file inside a specific folder
  const handleCreateFileInFolder = async (folderPath: string, fileName: string) => {
    let cleanFolder = folderPath.trim();
    if (!cleanFolder.startsWith('/')) cleanFolder = '/' + cleanFolder;
    if (cleanFolder.endsWith('/') && cleanFolder !== '/') cleanFolder = cleanFolder.slice(0, -1);

    let cleanName = fileName.trim().replace(/^\/+/, '');
    const fullPath = cleanFolder === '/' ? `/${cleanName}` : `${cleanFolder}/${cleanName}`;

    if (files.some(f => f.path === fullPath)) {
      await customAlert('同名文件已存在', { title: '提示' });
      return;
    }

    const ext = fullPath.split('.').pop() || '';
    let mimeType = 'text/plain';
    if (ext === 'html') mimeType = 'text/html';
    else if (ext === 'css') mimeType = 'text/css';
    else if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx') mimeType = 'text/javascript';
    else if (ext === 'json') mimeType = 'application/json';

    const newFile: VFSItem = {
      id: crypto.randomUUID(),
      path: fullPath,
      name: fullPath.split('/').pop() || cleanName,
      type: mimeType,
      size: 0,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [...files, newFile];
    setFiles(updated);
    onUpdateProjectVFS(updated);
    setActiveFilePath(newFile.path);
  };

  // Create subfolder inside a specific parent folder
  const handleCreateFolderInFolder = (parentFolderPath: string, folderName: string) => {
    let cleanParent = parentFolderPath.trim();
    if (!cleanParent.startsWith('/')) cleanParent = '/' + cleanParent;
    if (cleanParent.endsWith('/') && cleanParent !== '/') cleanParent = cleanParent.slice(0, -1);

    const cleanFolder = folderName.trim().replace(/^\/+|\/+$/g, '');
    const folderPath = cleanParent === '/' ? `/${cleanFolder}` : `${cleanParent}/${cleanFolder}`;
    const placeholderPath = `${folderPath}/.keep`;

    const placeholderFile: VFSItem = {
      id: crypto.randomUUID(),
      path: placeholderPath,
      name: '.keep',
      type: 'text/plain',
      size: 0,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [...files, placeholderFile];
    setFiles(updated);
    onUpdateProjectVFS(updated);
  };

  // Delete folder and all its children
  const handleDeleteFolder = (folderPath: string) => {
    let cleanFolder = folderPath.trim();
    if (!cleanFolder.startsWith('/')) cleanFolder = '/' + cleanFolder;

    const updated = files.filter(f => !(f.path === cleanFolder || f.path.startsWith(cleanFolder + '/')));
    setFiles(updated);
    onUpdateProjectVFS(updated);

    if (activeFilePath.startsWith(cleanFolder + '/') || activeFilePath === cleanFolder) {
      setActiveFilePath(updated[0]?.path || '/index.html');
    }
    setPreviewKey(prev => prev + 1);
  };

  // Move file or folder
  const handleMoveFile = (sourcePath: string, targetFolderPath: string) => {
    let targetDir = targetFolderPath.trim();
    if (!targetDir.startsWith('/')) targetDir = '/' + targetDir;
    if (targetDir.endsWith('/') && targetDir !== '/') targetDir = targetDir.slice(0, -1);

    const updated = files.map(file => {
      if (file.path === sourcePath) {
        const fileName = file.name;
        const newPath = targetDir === '/' ? `/${fileName}` : `${targetDir}/${fileName}`;
        return { ...file, path: newPath, updatedAt: Date.now() };
      }
      if (file.path.startsWith(sourcePath + '/')) {
        const subPath = file.path.slice(sourcePath.length);
        const newPath = targetDir === '/' ? subPath : `${targetDir}${subPath}`;
        return { ...file, path: newPath, updatedAt: Date.now() };
      }
      return file;
    });

    setFiles(updated);
    onUpdateProjectVFS(updated);

    if (activeFilePath === sourcePath) {
      const fileName = sourcePath.split('/').pop() || '';
      const newPath = targetDir === '/' ? `/${fileName}` : `${targetDir}/${fileName}`;
      setActiveFilePath(newPath);
    }
  };

  // Rename file or folder
  const handleRenameItem = (oldPath: string, newName: string) => {
    const parts = oldPath.split('/').filter(Boolean);
    parts.pop();
    const parentDir = '/' + parts.join('/');
    const newPath = parentDir === '/' ? `/${newName}` : `${parentDir}/${newName}`;

    const updated = files.map(file => {
      if (file.path === oldPath) {
        return { ...file, path: newPath, name: newName, updatedAt: Date.now() };
      }
      if (file.path.startsWith(oldPath + '/')) {
        const subPath = file.path.slice(oldPath.length);
        return { ...file, path: `${newPath}${subPath}`, updatedAt: Date.now() };
      }
      return file;
    });

    setFiles(updated);
    onUpdateProjectVFS(updated);

    if (activeFilePath === oldPath) {
      setActiveFilePath(newPath);
    }
  };

  // Smart Bundle Engine for iframe srcDoc
  const assembledSrcDoc = useMemo(() => {
    const htmlFile = files.find(f => f.path.endsWith('.html')) || files[0];
    if (!htmlFile) return '<html><body><p>没有找到 HTML 文件</p></body></html>';

    let htmlContent = htmlFile.content;

    // Inject console interceptor script
    const consoleInterceptor = `
    <script>
      (function() {
        var _log = console.log, _error = console.error, _warn = console.warn, _info = console.info;
        function sendLog(type, args) {
          try {
            var msg = Array.from(args).map(function(a) {
              if (typeof a === 'object') return JSON.stringify(a);
              return String(a);
            }).join(' ');
            window.parent.postMessage({ type: 'STUDIO_CONSOLE_LOG', logType: type, message: msg }, '*');
          } catch(e) {}
        }
        console.log = function() { sendLog('log', arguments); _log.apply(console, arguments); };
        console.error = function() { sendLog('error', arguments); _error.apply(console, arguments); };
        console.warn = function() { sendLog('warn', arguments); _warn.apply(console, arguments); };
        console.info = function() { sendLog('info', arguments); _info.apply(console, arguments); };
        window.onerror = function(msg, url, line) {
          sendLog('error', ['[Uncaught Error]', msg, 'at line', line]);
        };
      })();
    </script>
    `;

    // Inline CSS files
    files.forEach(f => {
      if (f.path.endsWith('.css')) {
        const styleTag = `<style>/* Inlined from ${f.path} */\n${f.content}\n</style>`;
        const linkRegex = new RegExp(`<link[^>]*href=["']\\.?/?${f.name}["'][^>]*>`, 'gi');
        if (linkRegex.test(htmlContent)) {
          htmlContent = htmlContent.replace(linkRegex, styleTag);
        } else {
          htmlContent = htmlContent.replace('</head>', `${styleTag}\n</head>`);
        }
      }
    });

    // Inline JS files
    files.forEach(f => {
      if (f.path.endsWith('.js')) {
        const scriptTag = `<script>/* Inlined from ${f.path} */\n${f.content}\n</script>`;
        const scriptRegex = new RegExp(`<script[^>]*src=["']\\.?/?${f.name}["'][^>]*><\\/script>`, 'gi');
        if (scriptRegex.test(htmlContent)) {
          htmlContent = htmlContent.replace(scriptRegex, scriptTag);
        } else {
          htmlContent = htmlContent.replace('</body>', `${scriptTag}\n</body>`);
        }
      }
    });

    if (htmlContent.includes('<head>')) {
      htmlContent = htmlContent.replace('<head>', `<head>${consoleInterceptor}`);
    } else {
      htmlContent = `${consoleInterceptor}${htmlContent}`;
    }

    return htmlContent;
  }, [files, previewKey]);

  // Listen for console logs posted from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'STUDIO_CONSOLE_LOG') {
        setConsoleLogs(prev => [
          ...prev.slice(-100),
          {
            id: crypto.randomUUID(),
            type: e.data.logType || 'log',
            message: e.data.message || '',
            timestamp: Date.now(),
          }
        ]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Export full standalone SPA HTML download
  const handleExportHTML = () => {
    const blob = new Blob([assembledSrcDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'spa_app'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Expose imperative handle methods to parent
  useImperativeHandle(ref, () => ({
    refreshPreview: () => setPreviewKey(prev => prev + 1),
    exportHTML: handleExportHTML,
  }));

  // Apply AI generated code block directly to VFS file
  const handleApplyCodeToVFS = (targetFileName: string, codeContent: string) => {
    let cleanPath = targetFileName.trim();
    if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;

    const existingFile = files.find(f => f.path === cleanPath || f.name === cleanPath.replace(/^\//, ''));
    let updated: VFSItem[];

    if (existingFile) {
      updated = files.map(f => f.id === existingFile.id ? { ...f, content: codeContent, updatedAt: Date.now() } : f);
    } else {
      updated = [
        ...files,
        {
          id: crypto.randomUUID(),
          path: cleanPath,
          name: cleanPath.replace(/^\//, ''),
          type: cleanPath.endsWith('.css') ? 'text/css' : cleanPath.endsWith('.js') ? 'text/javascript' : 'text/html',
          size: new Blob([codeContent]).size,
          content: codeContent,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      ];
    }

    setFiles(updated);
    onUpdateProjectVFS(updated);
    setActiveFilePath(cleanPath);
    setPreviewKey(prev => prev + 1);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#f2f2f6] dark:bg-[#0a0a0c] text-gray-900 dark:text-gray-100 overflow-hidden relative">
      
      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Panel 1: AI Assistant Chat */}
        {((mobileTab === 'chat') || (window.innerWidth >= 768)) && (
          <div className={`w-full md:w-[360px] lg:w-[400px] border-r border-gray-200/60 dark:border-gray-800/60 flex flex-col bg-white dark:bg-[#18181b] shrink-0 relative ${mobileTab === 'chat' ? 'flex' : 'hidden md:flex'}`}>
            
            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-24">
              {chat.messages.length === 0 ? (
                <div className="text-center py-16 space-y-3 text-gray-400">
                  <Terminal className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
                  <p className="text-xs font-medium">输入你的需求，AI 将自动编写与实时修改页面文件</p>
                </div>
              ) : (
                chat.messages.map((m, idx) => (
                  <ChatMessageBubble
                    key={m.id}
                    message={m}
                    messages={chat.messages}
                    messageIndex={idx}
                    isStreaming={isStreaming}
                    isLastMessage={idx === chat.messages.length - 1}
                    theme={theme}
                    onApplyCodeToVFS={handleApplyCodeToVFS}
                    toolbarConfig={settings?.bubbleToolsConfig}
                    speakingId={speakingId}
                    onCopyMessage={(id, text) => navigator.clipboard.writeText(text)}
                    onRegenerateMessage={onRegenerate}
                    onSpeakMessage={handleSpeakMessage}
                    onBranchMessage={onBranchChat}
                    onTogglePinMessage={onTogglePin}
                    onDeleteMessage={onDeleteMessage}
                    onEditMessage={onEditMessage}
                    onSwitchVersionMessage={onSwitchVersion}
                    onEnlargeImage={(url) => setLightboxUrl(url)}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reusable Chat Input - Floating */}
            <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none p-3 pb-6">
              <div className="pointer-events-auto">
                <ChatInput
                  onSendMessage={onSendMessage}
                  isStreaming={isStreaming}
                  onStopGeneration={onStopGeneration || (() => {})}
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
                  onPreviewAttachment={(attachment) => setLightboxUrl(attachment.url)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Image Lightbox Modal */}
        {lightboxUrl && (
          <ImageLightbox
            url={lightboxUrl}
            isOpen={Boolean(lightboxUrl)}
            onClose={() => setLightboxUrl(null)}
          />
        )}

        {/* Right Panel Workspace: Code Editor or Live Preview */}
        <div className={`flex-1 flex flex-col bg-gray-50 dark:bg-[#121214] overflow-hidden min-w-0 ${mobileTab !== 'chat' ? 'flex' : 'hidden md:flex'}`}>
          
          {/* VFS Code Editor View */}
          {(activeRightTab === 'editor' || (mobileTab === 'editor')) && (
            <div className="flex-1 flex bg-white dark:bg-[#1a1a1d] overflow-hidden">
              
              <AnimatePresence mode="wait">
                {/* Left VSCode-style VFSTreeExplorer Sidebar */}
                {showTreeExplorer && !activeFilePath && (
                  <motion.div 
                    key="explorer"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="flex-1 shrink-0 flex flex-col h-full bg-gray-50/50 dark:bg-[#141416]/50"
                  >
                    <VFSTreeExplorer
                      files={files}
                      activeFilePath={activeFilePath}
                      onSelectFile={(f) => {
                        setActiveFilePath(f.path);
                        setShowTreeExplorer(false);
                      }}
                      onCreateFile={handleCreateFileInFolder}
                      onCreateFolder={handleCreateFolderInFolder}
                      onDeleteFile={handleDeleteFile}
                      onDeleteFolder={handleDeleteFolder}
                      onMoveFile={handleMoveFile}
                      onRenameItem={handleRenameItem}
                    />
                  </motion.div>
                )}

                {/* Right Code Editor Body */}
                {activeFilePath && (
                  <motion.div 
                    key="editor"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="flex-1 flex flex-col min-w-0 overflow-hidden relative group"
                  >
                    {/* Floating Controls (Back & Save) */}
                    <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowTreeExplorer(true);
                          setActiveFilePath('');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 dark:bg-[#1a1a1d]/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-full text-xs font-medium text-gray-700 dark:text-gray-200 shadow-lg hover:bg-white dark:hover:bg-[#202024] transition-all"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-brand" />
                        <span>资源库</span>
                      </button>

                      {activeFile && isModified && (
                        <button
                          onClick={handleSaveFile}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-full text-xs font-bold shadow-lg hover:bg-brand/90 transition-all"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>保存修改</span>
                        </button>
                      )}
                      
                      {activeFile && (
                        <div className="px-3 py-1.5 bg-gray-100/50 dark:bg-gray-800/50 backdrop-blur-xs rounded-full text-[10px] text-gray-500 font-mono border border-gray-200/50 dark:border-gray-700/50">
                          {activeFile.name}
                        </div>
                      )}
                    </div>

                    {/* Code Editor Body - Unified Highlighting & Editable */}
                    <div className="flex-1 relative bg-white dark:bg-[#18181b] overflow-hidden">
                      <UnifiedCodeEditor
                        value={editorContent}
                        onChange={(val) => {
                          setEditorContent(val);
                          setIsModified(true);
                        }}
                        filePath={activeFile?.path}
                        fileName={activeFile?.name}
                        theme={theme}
                      />
                    </div>
                  </motion.div>
                )}

                {!showTreeExplorer && !activeFilePath && (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-8 text-center bg-gray-50 dark:bg-[#121214]"
                  >
                    <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-2xl">
                      <FileCode className="w-12 h-12 opacity-20" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">欢迎来到代码空间</h3>
                      <p className="text-xs text-gray-400 mt-1">打开资源管理器选择文件开始创作</p>
                    </div>
                    <button
                      onClick={() => setShowTreeExplorer(true)}
                      className="px-4 py-2 bg-brand text-white rounded-xl text-xs font-bold shadow-sm"
                    >
                      打开资源管理器
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
          </div>
        )}

          {/* Live Preview View */}
          {(activeRightTab === 'preview' || (mobileTab === 'preview')) && (
            <div className="flex-1 flex flex-col bg-gray-50 dark:bg-[#121214] overflow-hidden relative">
              <iframe
                key={previewKey}
                srcDoc={assembledSrcDoc}
                title="SPA Preview"
                sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
                className="w-full h-full border-none bg-white"
              />
            </div>
          )}

          {/* Console Drawer */}
          {showConsole && (
            <div className="h-44 bg-gray-900 text-gray-100 font-mono text-xs border-t border-gray-800 flex flex-col shrink-0 z-10">
              <div className="px-4 py-2 bg-gray-800/80 flex items-center justify-between text-[11px] text-gray-400">
                <span>控制台输出日志</span>
                <button
                  onClick={() => setConsoleLogs([])}
                  className="hover:text-white transition-colors"
                >
                  清空
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {consoleLogs.length === 0 ? (
                  <p className="text-gray-500 italic">暂无控制台日志输出</p>
                ) : (
                  consoleLogs.map(log => (
                    <div
                      key={log.id}
                      className={`flex gap-2 ${
                        log.type === 'error'
                          ? 'text-red-400'
                          : log.type === 'warn'
                          ? 'text-amber-400'
                          : 'text-gray-300'
                      }`}
                    >
                      <span className="text-gray-600 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="whitespace-pre-wrap break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Bottom Bar (Bottom Navigation & Console Toggle Bar) */}
      <div className="bg-white/90 dark:bg-[#18181c]/90 backdrop-blur-xl border-t border-gray-200/60 dark:border-gray-800/60 py-2 px-4 flex items-center justify-center gap-2 shrink-0 z-30">
        <div className="flex items-center bg-gray-100 dark:bg-[#25252a] p-1 rounded-full border border-gray-200/60 dark:border-gray-700/60 shadow-2xs relative">
          <button
            onClick={() => {
              setMobileTab('chat');
              setActiveRightTab('preview');
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer relative z-10 ${
              mobileTab === 'chat'
                ? 'text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {mobileTab === 'chat' && (
              <motion.div 
                layoutId="active-pill"
                className="absolute inset-0 bg-brand dark:bg-brand-dark rounded-full -z-10"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span>AI 助手</span>
          </button>

          <button
            onClick={() => {
              setMobileTab('editor');
              setActiveRightTab('editor');
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer relative z-10 ${
              (mobileTab === 'editor' || (activeRightTab === 'editor' && mobileTab !== 'chat'))
                ? 'text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {(mobileTab === 'editor' || (activeRightTab === 'editor' && mobileTab !== 'chat')) && (
              <motion.div 
                layoutId="active-pill"
                className="absolute inset-0 bg-brand dark:bg-brand-dark rounded-full -z-10"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span>VFS 代码</span>
          </button>

          <button
            onClick={() => {
              setMobileTab('preview');
              setActiveRightTab('preview');
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer relative z-10 ${
              (mobileTab === 'preview' || (activeRightTab === 'preview' && mobileTab !== 'chat'))
                ? 'text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {(mobileTab === 'preview' || (activeRightTab === 'preview' && mobileTab !== 'chat')) && (
              <motion.div 
                layoutId="active-pill"
                className="absolute inset-0 bg-brand dark:bg-brand-dark rounded-full -z-10"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span>实时预览</span>
          </button>

          <div className="w-[1px] h-4 bg-gray-300 dark:bg-gray-700 mx-1" />

          <button
            onClick={() => setShowConsole(prev => !prev)}
            className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
              showConsole
                ? 'bg-amber-500 text-white shadow-xs'
                : consoleLogs.length > 0
                ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
            title={`切换控制台抽屉 (${consoleLogs.length})`}
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
});
