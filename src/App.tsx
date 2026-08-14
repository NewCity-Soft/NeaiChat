import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Menu, Info, AlertCircle, CheckCircle, X, Zap, PanelLeft, PanelLeftClose, Plus, Settings, Brain, Sparkles, Sliders, Trash2, Download, HardDrive, ShieldCheck, RotateCcw, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Chat, AppSettings, Message, PromptTemplate, Attachment, ChatMode, CodingProject, ContentBlock } from './types';
import { VFSItem } from './utils/vfs';
import { CodingProjectCreator } from './components/CodingProjectCreator';
import { CodingStudioWorkspace, CodingStudioWorkspaceRef } from './components/CodingStudioWorkspace';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { SettingsModal, SettingsTab } from './components/SettingsModal';
import { PromptLibraryModal } from './components/PromptLibraryModal';
import { ExportModal } from './components/ExportModal';
import { VFSModal } from './components/VFSModal';
import { LegalNoticeModal } from './components/LegalNoticeModal';
import { FirstTimeConsentModal } from './components/FirstTimeConsentModal';
import { CustomInputDialog } from './components/CustomInputDialog';
import { CustomDialogs } from './components/CustomDialogs';
import { customConfirm, customAlert } from './services/dialogService';
import { requestCustomInput as customPrompt } from './services/inputService';
import { writeMainLog, initAndCleanup } from './utils/aigc-logs';
import { DEFAULT_WATERMARK_LABEL } from './utils/explicit-watermark';
import { streamChatCompletion, generateTitle, compressHistory } from './services/llm';
import { tools, executeTool } from './services/tools';
import { formatErrorMessage } from './utils/error-handler';
import { estimateTokens } from './utils/token-utils';
import { splitColdAndHotZone } from './utils/compress-utils';
import { safeParseJSON, repairJSON } from './utils/safe-json';
import { DEFAULT_HEADER_TOOLS, sanitizeToolbarConfig } from './utils/toolbar-defaults';

export default function App() {
  const [chats, setChats] = useLocalStorage<Chat[]>('harmony-chats', []);
  const [isCompressing, setIsCompressing] = useState(false);
  const codingWorkspaceRef = useRef<CodingStudioWorkspaceRef>(null);
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'warning' | 'error' | 'success' } | null>(null);

  const showToast = (message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => prev?.message === message ? null : prev);
    }, 4000);
  };
  const [promptTemplates, setPromptTemplates] = useLocalStorage<PromptTemplate[]>('harmony-prompts', [
    { id: '1', title: '全能助手', content: '你是一个知识渊博、耐心且幽默的AI助手。' },
    { id: '2', title: '程序员', content: '你是一个精通多种编程语言的技术专家，你的回答应该简洁、专业并包含实用的代码示例。' },
    { id: '3', title: '翻译官', content: '你是一个精通多国语言的专业翻译官。我会给你发送内容，请你将其翻译成地道的中文（如果是中文则翻译成英文），并指出其中的重点词汇。' },
    { id: '4', title: '创意写作', content: '你是一个极具想象力的创意作家，擅长构思故事情节和描写生动的画面。' },
  ]);
  const [settings, setSettings] = useLocalStorage<AppSettings>('harmony-settings', {
    apiKey: '',
    apiUrl: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
    systemPrompt: '',
    temperature: 0.7,
    maxTokens: 2000,
    themeMode: 'system',
    preloadPyodide: false,
    voiceButtonMode: 'auto',
    imageGen: { id: 'image', name: '图像生成', apiUrl: '', apiKey: '', model: 'dall-e-3' },
    videoGen: { id: 'video', name: '视频生成', apiUrl: '', apiKey: '', model: 'luma-gen-1' }
  }, { encrypt: true });
  
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Initial startup logic
  useEffect(() => {
    if (chats.length === 0) {
      handleNewChat();
    } else {
      if (settings.startupBehavior === 'new') {
        const emptyChat = chats.find(c => c.messages.length === 0);
        if (emptyChat) {
          setCurrentChatId(emptyChat.id);
        } else {
          handleNewChat();
        }
      } else {
        // Default to last chat
        setCurrentChatId(chats[0].id);
      }
    }
  }, []);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('harmony-settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const mode = parsed.themeMode || 'system';
          if (mode === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          }
          return mode;
        } catch (e) {}
      }
    }
    return 'light';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(!settings.apiKey && !settings.apiUrl);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('provider');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExportLegalNoticeOpen, setIsExportLegalNoticeOpen] = useState(false);
  const [isVFSOpen, setIsVFSOpen] = useState(false);
  const [showStudio, setShowStudio] = useLocalStorage<boolean>('harmony-show-studio', false);
  const [hasAgreedLegal, setHasAgreedLegal] = useLocalStorage<boolean>('harmony-legal-consent-v1', false);

  const handleOpenExport = () => {
    if (!currentChat || currentChat.messages.length === 0) {
      showToast('当前无需要导出的记录', 'warning');
      return;
    }
    if (settings.exportMode === 'disabled') {
      showToast('导出功能已被关闭。可在“设置 -> 导出与合规”中重新配置。', 'warning');
      return;
    }
    if (!settings.exportMode || settings.exportMode === 'unconfigured') {
      setIsExportLegalNoticeOpen(true);
      return;
    }
    setIsExportOpen(true);
  };

  useEffect(() => {
    const handlePromptLegal = () => {
      if (!settings.exportMode || settings.exportMode === 'unconfigured') {
        setIsExportLegalNoticeOpen(true);
      }
    };
    window.addEventListener('prompt-export-legal', handlePromptLegal);
    return () => window.removeEventListener('prompt-export-legal', handlePromptLegal);
  }, [settings.exportMode]);
  const [watermarkLabel, setWatermarkLabel] = useLocalStorage<string>('harmony-watermark-label', DEFAULT_WATERMARK_LABEL);
  const [selectedPrompt, setSelectedPrompt] = useState<string | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [pyodideProgress, setPyodideProgress] = useState<{ percent: number; message: string } | null>(null);

  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateTheme = () => {
      const mode = settings.themeMode || 'system';
      let theme: 'light' | 'dark' = 'light';
      
      if (mode === 'system') {
        theme = mediaQuery.matches ? 'dark' : 'light';
      } else {
        theme = mode;
      }
      
      setResolvedTheme(theme);
      if (theme === 'dark') {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    };

    updateTheme();
    mediaQuery.addEventListener('change', updateTheme);

    return () => mediaQuery.removeEventListener('change', updateTheme);
  }, [settings.themeMode]);

  // Handle Pyodide preloading
  useEffect(() => {
    if (settings.preloadPyodide) {
      import('./services/tools').then(({ getPyodide }) => {
        getPyodide().catch(err => {
          console.error('Pyodide preloading failed:', err);
        });
      });
    }
  }, [settings.preloadPyodide]);

  // 监听 Python 初始化进度
  useEffect(() => {
    import('./services/tools').then(({ setPyodideProgressCallback }) => {
      setPyodideProgressCallback((percent, message) => {
        if (percent === 100 || percent === 0) {
          setTimeout(() => setPyodideProgress(null), 2000);
        } else {
          setPyodideProgress({ percent, message });
        }
      });
    });
  }, []);

  const currentChat = chats.find(c => c.id === currentChatId) || null;

  const handleNewChat = (mode: ChatMode = 'standard') => {
    const newChat: Chat = {
      id: crypto.randomUUID(),
      title: mode === 'coding' ? '未命名 SPA 工程' : '新对话',
      mode,
      codingProject: mode === 'coding' ? {
        id: crypto.randomUUID(),
        name: '未命名 SPA 工程',
        description: '单页面 HTML+JS+CSS 应用',
        isInitialized: false,
        vfsFiles: [],
      } : undefined,
      messages: [],
      updatedAt: Date.now(),
    };
    setChats([newChat, ...chats]);
    setCurrentChatId(newChat.id);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleCreateCodingProject = (projectName: string, initialFiles: VFSItem[], prompt: string) => {
    if (!currentChatId) return;

    const updatedCodingProject: CodingProject = {
      id: crypto.randomUUID(),
      name: projectName,
      description: '单页面 HTML+JS+CSS 应用程序',
      isInitialized: true,
      vfsFiles: initialFiles,
      activeFilePath: initialFiles[0]?.path || '/index.html',
    };

    setChats(prev => prev.map(c => {
      if (c.id === currentChatId) {
        return {
          ...c,
          title: projectName,
          codingProject: updatedCodingProject,
        };
      }
      return c;
    }));

    if (prompt) {
      handleSendMessage(prompt);
    }
  };

  const handleUpdateProjectVFS = (updatedFiles: VFSItem[]) => {
    if (!currentChatId) return;
    setChats(prev => prev.map(c => {
      if (c.id === currentChatId && c.codingProject) {
        return {
          ...c,
          codingProject: {
            ...c.codingProject,
            vfsFiles: updatedFiles,
          }
        };
      }
      return c;
    }));
  };

  const handleResetCodingProject = () => {
    if (!currentChatId) return;
    setChats(prev => prev.map(c => {
      if (c.id === currentChatId && c.codingProject) {
        return {
          ...c,
          codingProject: {
            ...c.codingProject,
            isInitialized: false,
            vfsFiles: [],
          }
        };
      }
      return c;
    }));
  };

  const handleDeleteChat = async (id: string) => {
    if (!(await customConfirm('确定要删除这个对话吗？', { title: '删除对话' }))) return;
    const newChats = chats.filter(c => c.id !== id);
    setChats(newChats);
    if (currentChatId === id) {
      setCurrentChatId(newChats[0]?.id || null);
    }
  };

  const handleRenameChat = async (id: string) => {
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    
    const newTitle = await customPrompt('请输入新的对话名称', { title: '重命名对话', placeholder: chat.title });
    if (newTitle !== null && newTitle.trim()) {
      setChats(prev => prev.map(c => 
        c.id === id ? { ...c, title: newTitle.trim() } : c
      ));
    }
  };

  const handleClearAll = async () => {
    if (!(await customConfirm('确定要清除所有对话吗？此操作不可撤销。', { title: '清除所有对话', confirmText: '清除' }))) return;
    setChats([]);
    setCurrentChatId(null);
  };

  const handleSendMessage = async (content: string, attachments?: Attachment[]) => {
    if (!settings.apiUrl) {
      setIsSettingsOpen(true);
      return;
    }

    let activeChatId = currentChatId;
    let activeChat = chats.find(c => c.id === activeChatId);
    let isFirstMessage = false;

    if (!activeChat) {
      const newChat: Chat = {
        id: crypto.randomUUID(),
        title: content.slice(0, 30) + (content.length > 30 ? '...' : ''),
        messages: [],
        updatedAt: Date.now(),
      };
      activeChat = newChat;
      activeChatId = newChat.id;
      setChats(prev => [newChat, ...prev]);
      setCurrentChatId(newChat.id);
      isFirstMessage = true;
    } else if (activeChat.messages.length === 0) {
      activeChat.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
      isFirstMessage = true;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      attachments,
      timestamp: Date.now(),
    };

    const newMessages = [...activeChat.messages, userMessage];
    
    setChats(prev => prev.map(c => 
      c.id === activeChatId 
        ? { ...c, messages: newMessages, updatedAt: Date.now(), title: activeChat?.title || c.title }
        : c
    ));

    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    if (isFirstMessage && settings.autoGenerateTitle !== false) {
      generateTitle(content, settings).then(title => {
        if (title) {
          setChats(prev => prev.map(c => 
            c.id === activeChatId ? { ...c, title } : c
          ));
        }
      });
    }

      let lastAssistantMessageId = '';
      let currentAssistantContent = '';
      let allToolCalls: any[] = [];
      let consolidatedAssistantContent = '';
      let consolidatedBlocks: ContentBlock[] = [];

      try {
        let currentMessages = [...newMessages];
        let shouldContinue = true;

        // Prepare effective settings for LLM streaming
        let effectiveSettings = { ...settings };
        if (activeChat?.codingProject && activeChat.codingProject.isInitialized) {
          // ... (vfs logic remains the same)
        }

        const assistantMessageId = crypto.randomUUID();
        lastAssistantMessageId = assistantMessageId;

        // Add the initial assistant message only once
        setChats(prev => prev.map(c => 
          c.id === activeChatId 
            ? { 
                ...c, 
                messages: [...c.messages, { id: assistantMessageId, role: 'assistant', content: '', timestamp: Date.now(), blocks: [] }] 
              }
            : c
        ));

        while (shouldContinue) {
          shouldContinue = false;
          let turnAssistantContent = '';
          let turnToolCalls: any[] = [];
          let turnBlocks: ContentBlock[] = [];
          let pendingText = '';
          let activeToolCallsInTurn: any[] = [];

          const stream = streamChatCompletion(currentMessages, effectiveSettings, abortControllerRef.current.signal);
          
          for await (const chunk of stream) {
            if (chunk.type === 'text') {
              // If we have accumulated tool_calls, flush them as blocks before text
              if (activeToolCallsInTurn.length > 0) {
                for (const tc of activeToolCallsInTurn) {
                  turnBlocks.push({ type: 'tool_call', tool_call: tc, tcId: `${assistantMessageId}-tc-${tc.id || Date.now()}` });
                }
                activeToolCallsInTurn = [];
              }
              pendingText += chunk.content;
              turnAssistantContent += chunk.content;
            } else if (chunk.type === 'tool_call' && chunk.delta) {
              // Flush pending text before tool_calls
              if (pendingText.trim()) {
                turnBlocks.push({ type: 'text', content: pendingText });
                pendingText = '';
              }
              for (const delta of chunk.delta) {
                const index = delta.index !== undefined && delta.index !== null ? Number(delta.index) : 0;
                if (!turnToolCalls[index]) {
                  turnToolCalls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                }
                if (delta.id) turnToolCalls[index].id = delta.id;
                if (delta.function?.name) turnToolCalls[index].function.name = delta.function.name;
                if (delta.function?.arguments) turnToolCalls[index].function.arguments += delta.function.arguments;
              }
              activeToolCallsInTurn = turnToolCalls.filter(Boolean);
            }
            
            // After all chunks processed in this batch, build the display state
            const flushedBlocks = [...turnBlocks];
            // Add any remaining text
            if (pendingText.trim()) {
              flushedBlocks.push({ type: 'text', content: pendingText });
            }
            // Add any remaining tool_calls that haven't been flushed yet
            const currentAllToolCalls = turnToolCalls.filter(Boolean);
            const unflushedToolCalls = currentAllToolCalls.filter(tc => 
              !flushedBlocks.some(b => b.type === 'tool_call' && b.tool_call?.id === tc.id)
            );
            for (const tc of unflushedToolCalls) {
              flushedBlocks.push({ type: 'tool_call', tool_call: tc, tcId: `${assistantMessageId}-tc-${tc.id || Date.now()}` });
            }

            const displayBlocks = [...consolidatedBlocks, ...flushedBlocks];

            setChats(prev => prev.map(c => {
              if (c.id !== activeChatId) return c;
              
              const updatedMessages = [...c.messages];
              const lastMsgIndex = updatedMessages.findIndex(m => m.id === assistantMessageId);
              if (lastMsgIndex !== -1) {
                const displayContent = consolidatedAssistantContent + turnAssistantContent;
                const combinedToolCalls = [...allToolCalls, ...currentAllToolCalls];
                
                updatedMessages[lastMsgIndex] = {
                  ...updatedMessages[lastMsgIndex],
                  content: displayContent,
                  tool_calls: combinedToolCalls.length > 0 ? combinedToolCalls : undefined,
                  blocks: displayBlocks
                };
              }

              return { ...c, messages: updatedMessages, updatedAt: Date.now() };
            }));
          }

          // After turn finishes - flush any remaining
          if (pendingText.trim()) {
            turnBlocks.push({ type: 'text', content: pendingText });
            pendingText = '';
          }
          const allTurnToolCalls = turnToolCalls.filter(Boolean);
          for (const tc of allTurnToolCalls) {
            if (!turnBlocks.some(b => b.type === 'tool_call' && b.tool_call?.id === tc.id)) {
              turnBlocks.push({ type: 'tool_call', tool_call: tc, tcId: `${assistantMessageId}-tc-${tc.id || Date.now()}` });
            }
          }

          const activeTurnToolCalls = turnToolCalls.filter(Boolean);
          for (const tc of activeTurnToolCalls) {
            if (tc.function) {
              tc.function.arguments = repairJSON(tc.function.arguments || '{}');
            }
          }

          consolidatedAssistantContent += turnAssistantContent;
          allToolCalls = [...allToolCalls, ...activeTurnToolCalls];
          consolidatedBlocks = [...consolidatedBlocks, ...turnBlocks];

          const turnAssistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: turnAssistantContent,
            timestamp: Date.now(),
            tool_calls: activeTurnToolCalls.length > 0 ? activeTurnToolCalls : undefined
          };
          currentMessages.push(turnAssistantMessage);

          if (activeTurnToolCalls.length > 0) {
            shouldContinue = true;
            for (const tc of activeTurnToolCalls) {
              let toolResult: { content: string, attachments?: any[] } = { content: '' };
              try {
                const args: any = safeParseJSON(tc.function.arguments, {});
                const toolContext = {
                  projectVFS: currentChat?.codingProject?.vfsFiles,
                  onUpdateProjectVFS: (updatedFiles: any[]) => {
                    setChats(prev => prev.map(c => c.id === currentChatId ? {
                      ...c,
                      codingProject: c.codingProject ? { ...c.codingProject, vfsFiles: updatedFiles } : undefined
                    } : c));
                  }
                };
                toolResult = await executeTool(tc.function.name, args, settings, toolContext);
              } catch (e: any) {
                toolResult = { content: `Error executing tool: ${e.message}` };
              }

              const toolMessage: Message = {
                id: crypto.randomUUID(),
                role: 'tool',
                content: toolResult.content,
                attachments: toolResult.attachments,
                timestamp: Date.now(),
                tool_call_id: tc.id,
                name: tc.function.name
              };
              
              currentMessages.push(toolMessage);
              setChats(prev => prev.map(c => 
                c.id === activeChatId 
                  ? { ...c, messages: [...c.messages, toolMessage] }
                  : c
              ));
            }
          }
        }
      } catch (error: any) {
      if (error.name !== 'AbortError') {
        const errorMsg = formatErrorMessage(error);
        // @ts-ignore
        const targetId = lastAssistantMessageId;
        
        setChats(prev => prev.map(c => {
          if (c.id !== activeChatId) return c;
          const updatedMessages = [...c.messages];
          const lastMsgIndex = updatedMessages.findIndex(m => m.id === targetId);
          if (lastMsgIndex !== -1) {
            updatedMessages[lastMsgIndex] = {
              ...updatedMessages[lastMsgIndex],
              error: errorMsg,
              isError: true
            };
          }
          return { ...c, messages: updatedMessages, updatedAt: Date.now() };
        }));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleEditUserMessage = async (messageId: string, newContent: string) => {
    if (!currentChatId || isStreaming) return;
    const activeChat = chats.find(c => c.id === currentChatId);
    if (!activeChat) return;

    const msgIndex = activeChat.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const targetMessage = activeChat.messages[msgIndex];
    if (targetMessage.role !== 'user') return;

    // 1. Update user message with new version
    let currentVersions = targetMessage.versions || [{ content: targetMessage.content }];
    const newVersionIndex = currentVersions.length;
    const newVersions = [...currentVersions, { content: newContent }];

    const updatedMessages = activeChat.messages.map(m => 
      m.id === messageId 
        ? { ...m, versions: newVersions, currentVersionIndex: newVersionIndex, content: newContent } 
        : m
    );

    setChats(prev => prev.map(c => 
      c.id === currentChatId 
        ? { 
            ...c, 
            messages: updatedMessages, 
            updatedAt: Date.now(), 
            title: activeChat?.title || c.title 
          }
        : c
    ));

    // 2. Find following assistant message to regenerate
    // Look ahead for the first assistant message that follows (skipping tool messages if any)
    let assistantMsgId = '';
    for (let i = msgIndex + 1; i < updatedMessages.length; i++) {
      if (updatedMessages[i].role === 'assistant') {
        assistantMsgId = updatedMessages[i].id;
        break;
      }
      if (updatedMessages[i].role === 'user') break;
    }

    if (assistantMsgId) {
      handleRegenerate(assistantMsgId, newVersionIndex, updatedMessages);
    } else {
      // If no following assistant message, trigger a new one
      handleSendMessage(newContent);
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSwitchVersion = (messageId: string, versionIndex: number) => {
    if (!currentChatId) return;
    setChats(prev => prev.map(c => {
      if (c.id !== currentChatId) return c;
      const targetMsgIndex = c.messages.findIndex(m => m.id === messageId);
      if (targetMsgIndex === -1) return c;

      const targetMsg = c.messages[targetMsgIndex];
      let linkedId = '';

      if (targetMsg.role === 'assistant') {
        // Find the user message that precedes this assistant message (the prompt for this turn)
        for (let i = targetMsgIndex - 1; i >= 0; i--) {
          if (c.messages[i].role === 'user') {
            linkedId = c.messages[i].id;
            break;
          }
        }
      } else if (targetMsg.role === 'user') {
        // Find the assistant message that follows this user message (the response for this turn)
        for (let i = targetMsgIndex + 1; i < c.messages.length; i++) {
          if (c.messages[i].role === 'assistant') {
            linkedId = c.messages[i].id;
            break;
          }
          if (c.messages[i].role === 'user') break; // Don't cross into the next turn
        }
      }

      return {
        ...c,
        messages: c.messages.map((m) => {
          // If this is the message being switched OR its linked partner
          if (m.id === messageId || m.id === linkedId) {
            // Only update if the version exists (for the partner, it might not exist yet)
            if (m.versions && versionIndex < m.versions.length) {
              const v = m.versions[versionIndex];
              return { 
                ...m, 
                currentVersionIndex: versionIndex,
                content: v.content,
                tool_calls: v.tool_calls || []
              };
            }
            // If it's the target message itself, we definitely want to update the index 
            // (though normally versions should exist if the UI allows switching)
            if (m.id === messageId) {
              return { ...m, currentVersionIndex: versionIndex };
            }
          }
          return m;
        })
      };
    }));
  };

  const handleRegenerate = async (messageId: string, forcedVersionIndex?: number, overrideMessages?: Message[]) => {
    if (!currentChatId || !settings.apiUrl || isStreaming) return;
    const activeChat = chats.find(c => c.id === currentChatId);
    if (!activeChat) return;

    const msgIndex = activeChat.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const messagesInChat = overrideMessages || activeChat.messages;
    const targetMessage = messagesInChat[msgIndex];

    // Context is everything before this message
    const messagesToUse = messagesInChat.slice(0, msgIndex);

    // Ensure targetMessage has versions
    let currentVersions = targetMessage.versions || [
      { content: targetMessage.content, tool_calls: targetMessage.tool_calls, blocks: targetMessage.blocks }
    ];
    
    const newVersionIndex = forcedVersionIndex !== undefined ? forcedVersionIndex : currentVersions.length;
    let newVersions = [...currentVersions];
    
    if (forcedVersionIndex !== undefined) {
      // If we are forcing a version index (e.g. from a user edit), ensure we have enough slots
      while (newVersions.length <= forcedVersionIndex) {
        newVersions.push({ content: '', tool_calls: [], blocks: [] });
      }
      newVersions[forcedVersionIndex] = { content: '', tool_calls: [], blocks: [] };
    } else {
      newVersions.push({ content: '', tool_calls: [], blocks: [] });
    }

    setChats(prev => prev.map(c => 
      c.id === currentChatId 
        ? { 
            ...c, 
            messages: c.messages.map(m => 
              m.id === messageId 
                ? { ...m, versions: newVersions, currentVersionIndex: newVersionIndex } 
                : m
            ) 
          }
        : c
    ));

    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    try {
      // Use the correct versions of preceding messages based on their currentVersionIndex
      let currentMessages = messagesToUse.map(m => {
        if (m.versions && m.currentVersionIndex !== undefined) {
          const v = m.versions[m.currentVersionIndex];
          return {
            ...m,
            content: v.content,
            tool_calls: v.tool_calls
          };
        }
        return m;
      });
      let shouldContinue = true;

      // Estimate prompt tokens
      const promptText = currentMessages.map(m => m.content).join('\n');
      const promptTokens = estimateTokens(promptText) + (settings.systemPrompt ? estimateTokens(settings.systemPrompt) : 0);

      let consolidatedAssistantContent = '';
      let allToolCalls: any[] = [];
      let consolidatedBlocks: ContentBlock[] = [];

      while (shouldContinue) {
        shouldContinue = false;
        let turnAssistantContent = '';
        let turnToolCalls: any[] = [];
        let turnBlocks: ContentBlock[] = [];
        let pendingText = '';
        let activeToolCallsInTurn: any[] = [];
        const stream = streamChatCompletion(currentMessages, settings, abortControllerRef.current.signal);
        
        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            if (activeToolCallsInTurn.length > 0) {
              for (const tc of activeToolCallsInTurn) {
                turnBlocks.push({ type: 'tool_call', tool_call: tc, tcId: `${messageId}-tc-${tc.id || Date.now()}` });
              }
              activeToolCallsInTurn = [];
            }
            pendingText += chunk.content;
            turnAssistantContent += chunk.content;
          } else if (chunk.type === 'tool_call' && chunk.delta) {
            if (pendingText.trim()) {
              turnBlocks.push({ type: 'text', content: pendingText });
              pendingText = '';
            }
            for (const delta of chunk.delta) {
              const index = delta.index !== undefined && delta.index !== null ? Number(delta.index) : 0;
              if (!turnToolCalls[index]) {
                turnToolCalls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
              }
              if (delta.id) turnToolCalls[index].id = delta.id;
              if (delta.function?.name) turnToolCalls[index].function.name = delta.function.name;
              if (delta.function?.arguments) turnToolCalls[index].function.arguments += delta.function.arguments;
            }
            activeToolCallsInTurn = turnToolCalls.filter(Boolean);
          }
          
          const flushedBlocks = [...turnBlocks];
          if (pendingText.trim()) {
            flushedBlocks.push({ type: 'text', content: pendingText });
          }
          const currentAllToolCalls = turnToolCalls.filter(Boolean);
          const unflushedToolCalls = currentAllToolCalls.filter(tc => 
            !flushedBlocks.some(b => b.type === 'tool_call' && b.tool_call?.id === tc.id)
          );
          for (const tc of unflushedToolCalls) {
            flushedBlocks.push({ type: 'tool_call', tool_call: tc, tcId: `${messageId}-tc-${tc.id || Date.now()}` });
          }
          const displayBlocks = [...consolidatedBlocks, ...flushedBlocks];

          setChats(prev => prev.map(c => {
            if (c.id !== currentChatId) return c;
            
            const displayContent = consolidatedAssistantContent + turnAssistantContent;
            const displayToolCalls = [...allToolCalls, ...currentAllToolCalls];

            return {
              ...c,
              messages: c.messages.map(m => {
                if (m.id !== messageId) return m;
                const updatedVersions = [...(m.versions || [])];
                updatedVersions[newVersionIndex] = {
                  content: displayContent,
                  tool_calls: displayToolCalls.length > 0 ? displayToolCalls : undefined,
                  blocks: displayBlocks
                };
                return { ...m, versions: updatedVersions };
              }),
              usage: {
                promptTokens,
                completionTokens: estimateTokens(displayContent),
                totalTokens: promptTokens + estimateTokens(displayContent)
              }
            };
          }));
        }

        // Flush remaining
        if (pendingText.trim()) {
          turnBlocks.push({ type: 'text', content: pendingText });
          pendingText = '';
        }
        const allTurnToolCalls = turnToolCalls.filter(Boolean);
        for (const tc of allTurnToolCalls) {
          if (!turnBlocks.some(b => b.type === 'tool_call' && b.tool_call?.id === tc.id)) {
            turnBlocks.push({ type: 'tool_call', tool_call: tc, tcId: `${messageId}-tc-${tc.id || Date.now()}` });
          }
        }

        const activeTurnToolCalls = turnToolCalls.filter(Boolean);
        for (const tc of activeTurnToolCalls) {
          if (tc.function) {
            tc.function.arguments = repairJSON(tc.function.arguments || '{}');
          }
        }

        consolidatedAssistantContent += turnAssistantContent;
        allToolCalls = [...allToolCalls, ...activeTurnToolCalls];
        consolidatedBlocks = [...consolidatedBlocks, ...turnBlocks];

        const turnAssistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: turnAssistantContent,
          timestamp: Date.now(),
          tool_calls: activeTurnToolCalls.length > 0 ? activeTurnToolCalls : undefined
        };
        currentMessages.push(turnAssistantMessage);
        
        if (activeTurnToolCalls.length > 0) {
          shouldContinue = true;
          
          for (const tc of activeTurnToolCalls) {
            let toolResult: { content: string, attachments?: any[] } = { content: '' };
            try {
              const args: any = safeParseJSON(tc.function.arguments, {});
              const toolContext = {
                projectVFS: currentChat?.codingProject?.vfsFiles,
                onUpdateProjectVFS: (updatedFiles: any[]) => {
                  setChats(prev => prev.map(c => c.id === currentChatId ? {
                    ...c,
                    codingProject: c.codingProject ? { ...c.codingProject, vfsFiles: updatedFiles } : undefined
                  } : c));
                }
              };
              toolResult = await executeTool(tc.function.name, args, settings, toolContext);
            } catch (e: any) {
              toolResult = { content: `Error executing tool: ${e.message}` };
            }

            const toolMessage: Message = {
              id: crypto.randomUUID(),
              role: 'tool',
              content: toolResult.content,
              attachments: toolResult.attachments,
              timestamp: Date.now(),
              tool_call_id: tc.id,
              name: tc.function.name
            };
            
            currentMessages.push(toolMessage);
            setChats(prev => prev.map(c => {
              if (c.id !== currentChatId) return c;
              const msgIndex = c.messages.findIndex(m => m.id === messageId);
              if (msgIndex === -1) return c;
              
              const updatedMessages = [...c.messages];
              let insertIndex = msgIndex + 1;
              while (insertIndex < updatedMessages.length && updatedMessages[insertIndex].role === 'tool') {
                insertIndex++;
              }
              updatedMessages.splice(insertIndex, 0, toolMessage);
              
              return { ...c, messages: updatedMessages };
            }));
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        const errorMsg = formatErrorMessage(error);
        setChats(prev => prev.map(c => {
          if (c.id !== currentChatId) return c;
          return {
            ...c,
            messages: c.messages.map(m => {
              if (m.id !== messageId) return m;
              const updatedVersions = [...(m.versions || [])];
              updatedVersions[newVersionIndex] = {
                ...updatedVersions[newVersionIndex],
                error: errorMsg,
                isError: true
              };
              return { ...m, versions: updatedVersions, isError: true };
            })
          };
        }));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setChats(prev => prev.map(c => ({
      ...c,
      messages: c.messages.filter(m => m.id !== messageId),
      updatedAt: c.id === currentChatId ? Date.now() : c.updatedAt
    })));
  };

  const handleTogglePin = (messageId: string) => {
    if (!currentChatId) return;
    setChats(prev => prev.map(c => {
      if (c.id !== currentChatId) return c;
      return {
        ...c,
        messages: c.messages.map(m => 
          m.id === messageId ? { ...m, isPinned: !m.isPinned } : m
        )
      };
    }));
  };

  const handleBranchChat = (messageId: string) => {
    if (!currentChatId) return;
    const activeChat = chats.find(c => c.id === currentChatId);
    if (!activeChat) return;

    const msgIndex = activeChat.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const slicedMessages = activeChat.messages.slice(0, msgIndex + 1);
    const branchedMessages: Message[] = slicedMessages.map(m => ({
      ...m,
      id: crypto.randomUUID(),
    }));

    const branchedChat: Chat = {
      id: crypto.randomUUID(),
      title: `分支: ${activeChat.title || '新对话'}`,
      messages: branchedMessages,
      updatedAt: Date.now(),
    };

    setChats(prev => [branchedChat, ...prev]);
    setCurrentChatId(branchedChat.id);
  };

  const handleCompressChat = async () => {
    if (!currentChatId || isStreaming || isCompressing) return;
    const activeChat = chats.find(c => c.id === currentChatId);
    if (!activeChat || activeChat.messages.length === 0) {
      showToast('当前对话暂无内容，无需压缩。', 'info');
      return;
    }

    const hotZoneRounds = settings.hotZoneRounds ?? 5;
    const { coldMessages, hotMessages } = splitColdAndHotZone(activeChat.messages, hotZoneRounds);

    if (coldMessages.length === 0) {
      const userMsgCount = activeChat.messages.filter(m => m.role === 'user' && !m.isCompressedSummary).length;
      showToast(`当前对话历史较少（共 ${userMsgCount} 轮对话，设定保留最新 ${hotZoneRounds} 轮），暂无需压缩冷区。`, 'warning');
      return;
    }

    setIsCompressing(true);
    try {
      const summaryText = await compressHistory(coldMessages, settings);

      if (!summaryText || !summaryText.trim()) {
        throw new Error('生成的摘要为空，请检查网络或模型配置。');
      }

      const summaryUserMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: `[📌 上下文历史压缩摘要]\n系统说明：以下是早期冷区历史对话的结构化极简提炼（已压缩，不包含最新保留的 ${hotZoneRounds} 轮对话）：\n\n${summaryText}`,
        timestamp: Date.now(),
        isCompressedSummary: true,
      };

      const summaryAssistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `已成功完成冷区历史压缩！保留了最近 ${hotZoneRounds} 轮（${hotMessages.length} 条消息）完整对话，大幅降低了上下文 Token 占用，我们可以无缝接续对话！`,
        timestamp: Date.now() + 1,
        isCompressedSummaryReply: true,
      };

      const newMessages = [summaryUserMsg, summaryAssistantMsg, ...hotMessages];

      // Estimate new prompt tokens
      const promptText = newMessages.map(m => m.content).join('\n');
      const totalTokens = estimateTokens(promptText);

      setChats(prev => prev.map(c => 
        c.id === currentChatId 
          ? { 
              ...c, 
              messages: newMessages, 
              updatedAt: Date.now(),
              usage: {
                promptTokens: totalTokens,
                completionTokens: 0,
                totalTokens: totalTokens
              }
            }
          : c
      ));
      showToast('对话历史压缩成功！关联热区无缝缝合。', 'success');
    } catch (error: any) {
      showToast(`压缩对话失败: ${formatErrorMessage(error)}`, 'error');
    } finally {
      setIsCompressing(false);
    }
  };

  useEffect(() => {
    const handleOpenVFSPreview = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      // We could use the string path to select the file in VFSModal, 
      // but since VFSModal does not currently accept an initial selected path from outside natively
      // (it reads from its state), we will just open the modal.
      setIsVFSOpen(true);
    };
    window.addEventListener('open-vfs-preview', handleOpenVFSPreview);
    return () => window.removeEventListener('open-vfs-preview', handleOpenVFSPreview);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-primary dark:bg-bg-primary-dark text-gray-900 dark:text-gray-100 font-sans">
      
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <div
        className={`fixed lg:relative inset-y-0 left-0 z-50 transform lg:transform-none transition-all duration-300 ease-in-out shrink-0 h-full no-print ${
          isSidebarOpen
            ? 'translate-x-0 w-72 opacity-100'
            : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:opacity-0 pointer-events-none lg:pointer-events-none'
        }`}
      >
        <div className="w-72 h-full">
          <Sidebar
            chats={chats}
            currentChatId={currentChatId}
            showStudio={showStudio}
            onToggleStudio={() => setShowStudio(!showStudio)}
            onSelectChat={(id) => {
              setCurrentChatId(id);
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
            onClearAll={handleClearAll}
            onOpenSettings={() => {
              setSettingsTab('provider');
              setIsSettingsOpen(true);
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            onOpenUsage={() => {
              setSettingsTab('usage');
              setIsSettingsOpen(true);
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            onOpenPromptLibrary={() => {
              setIsPromptLibraryOpen(true);
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            onOpenVFS={() => {
              setIsVFSOpen(true);
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            onCloseSidebar={() => setIsSidebarOpen(false)}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full relative z-10 w-full overflow-hidden bg-transparent min-w-0">
        {/* Unified Pad / Tablet / Mobile Navigation Header */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-2 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 z-20 shrink-0 no-print">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center justify-center min-h-[40px] min-w-[40px] cursor-pointer"
              title={isSidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-5 h-5" />
              ) : (
                <PanelLeft className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => handleNewChat('standard')}
              className="hidden sm:flex items-center gap-1.5 p-2 rounded-full bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark hover:bg-brand/20 dark:hover:bg-brand-dark/30 transition-all font-medium text-xs border border-brand/20 dark:border-brand-dark/30 cursor-pointer min-h-[36px] min-w-[36px] justify-center"
              title="开启新对话"
            >
              <Plus className="w-4 h-4" />
            </button>
            <div className="flex flex-col min-w-0 -space-y-0.5">
              <span className="font-semibold text-sm sm:text-base text-gray-800 dark:text-gray-100 truncate max-w-[140px] sm:max-w-[240px] md:max-w-md">
                {currentChat?.title || '新对话'}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate opacity-80 select-none">
                AI 生成可能有误，请您二次核实
              </span>
            </div>
          </div>

          {/* Tablet/Pad Center Badges */}
          <div className="hidden md:flex items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100/90 dark:bg-gray-800/80 border border-gray-200/60 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 font-medium shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-brand dark:text-brand-dark" />
              <span className="font-mono text-[11px]">{settings.model || 'gemini-1.5-flash'}</span>
            </div>
            <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100/90 dark:bg-gray-800/80 border border-gray-200/60 dark:border-gray-700/60 text-gray-500 dark:text-gray-400 font-mono text-[11px] shadow-2xs">
              <span>{currentChat?.usage?.totalTokens ? currentChat.usage.totalTokens.toLocaleString() : 0} Tokens</span>
            </div>
          </div>

          {/* Action Buttons for Top Header Right */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Refresh button in Coding Mode */}
            {currentChat?.mode === 'coding' && currentChat?.codingProject?.isInitialized && showStudio && (
              <button
                onClick={() => codingWorkspaceRef.current?.refreshPreview()}
                title="刷新预览"
                className="p-2 text-gray-600 dark:text-gray-300 hover:text-brand dark:hover:text-brand-dark hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            )}

            {sanitizeToolbarConfig(settings.headerToolsConfig, DEFAULT_HEADER_TOOLS)
              .filter(t => t.visible)
              .map((tool) => {
                if (tool.id === 'vfs') {
                  return (
                    <button
                      key="vfs"
                      onClick={() => setIsVFSOpen(true)}
                      title="虚拟文件系统 (VFS)"
                      className="p-2 text-gray-600 dark:text-gray-300 hover:text-brand dark:hover:text-brand-dark hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                    >
                      <HardDrive className="w-5 h-5" />
                    </button>
                  );
                }

                if (tool.id === 'compress') {
                  return (
                    <button
                      key="compress"
                      onClick={handleCompressChat}
                      disabled={isCompressing}
                      title="压缩历史"
                      className="p-2 text-gray-600 dark:text-gray-300 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer disabled:opacity-50"
                    >
                      <Zap className="w-5 h-5" />
                    </button>
                  );
                }

                if (tool.id === 'prompt_library') {
                  return (
                    <button
                      key="prompt_library"
                      onClick={() => setIsPromptLibraryOpen(true)}
                      title="提示词库"
                      className="p-2 text-gray-600 dark:text-gray-300 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                    >
                      <Brain className="w-5 h-5" />
                    </button>
                  );
                }

                if (tool.id === 'export_chat') {
                  if (settings.exportMode === 'disabled') return null;
                  return (
                    <button
                      key="export_chat"
                      onClick={() => {
                        if (currentChat?.mode === 'coding' && currentChat?.codingProject?.isInitialized) {
                          codingWorkspaceRef.current?.exportHTML();
                        } else {
                          handleOpenExport();
                        }
                      }}
                      title={currentChat?.mode === 'coding' ? "导出代码应用 (HTML)" : "导出对话 (Markdown / JSON)"}
                      className="p-2 text-gray-600 dark:text-gray-300 hover:text-brand dark:hover:text-brand-dark hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  );
                }

                if (tool.id === 'settings') {
                  return (
                    <button
                      key="settings"
                      onClick={() => setIsSettingsOpen(true)}
                      title="设置"
                      className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                  );
                }

                if (tool.id === 'new_chat') {
                  return (
                    <button
                      key="new_chat"
                      onClick={() => handleNewChat('standard')}
                      title="新对话"
                      className="p-2 text-brand dark:text-brand-dark hover:bg-brand/10 dark:hover:bg-brand-dark/20 rounded-full transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  );
                }

                if (tool.id === 'clear_all') {
                  return (
                    <button
                      key="clear_all"
                      onClick={handleClearAll}
                      title="清空所有对话"
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  );
                }

                return null;
              })}
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {currentChat?.mode === 'coding' ? (
            !currentChat.codingProject?.isInitialized ? (
              <CodingProjectCreator
                onCreateProject={handleCreateCodingProject}
              />
            ) : (
              <CodingStudioWorkspace
                ref={codingWorkspaceRef}
                chat={currentChat}
                project={currentChat.codingProject}
                onUpdateProjectVFS={handleUpdateProjectVFS}
                onSendMessage={handleSendMessage}
                isStreaming={isStreaming}
                onResetProject={handleResetCodingProject}
                settings={settings}
                theme={resolvedTheme}
                onTogglePin={handleTogglePin}
                onRegenerate={handleRegenerate}
                onEditMessage={handleEditUserMessage}
                onSwitchVersion={handleSwitchVersion}
                onDeleteMessage={handleDeleteMessage}
                onBranchChat={handleBranchChat}
                onCompressChat={handleCompressChat}
                isCompressing={isCompressing}
                onOpenVFS={() => setIsVFSOpen(true)}
              />
            )
          ) : (
            <ChatArea
              messages={currentChat?.messages || []}
              onSendMessage={handleSendMessage}
              isStreaming={isStreaming}
              onStopGeneration={handleStopGeneration}
              onTogglePin={handleTogglePin}
              onRegenerate={handleRegenerate}
              onEditMessage={handleEditUserMessage}
              onSwitchVersion={handleSwitchVersion}
              onDeleteMessage={handleDeleteMessage}
              onBranchChat={handleBranchChat}
              onCompressChat={handleCompressChat}
              isCompressing={isCompressing}
              theme={resolvedTheme}
              initialInput={selectedPrompt}
              pyodideProgress={pyodideProgress}
              bubbleToolsConfig={settings.bubbleToolsConfig}
              settings={settings}
              watermarkLabel={watermarkLabel}
              onOpenVFS={() => setIsVFSOpen(true)}
              chatTitle={currentChat?.title}
            />
          )}
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={setSettings}
        chats={chats}
        initialTab={settingsTab}
        onToggleStudio={() => setShowStudio(!showStudio)}
      />

      <PromptLibraryModal
        isOpen={isPromptLibraryOpen}
        onClose={() => setIsPromptLibraryOpen(false)}
        templates={promptTemplates}
        onUpdateTemplates={setPromptTemplates}
        onSelectTemplate={(content) => {
          setSelectedPrompt(content);
          // Reset after a short delay so it can be re-triggered if same prompt selected again
          setTimeout(() => setSelectedPrompt(undefined), 100);
        }}
      />

      <CustomInputDialog />
      <CustomDialogs />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        chat={currentChat}
        modelName={settings.model}
        apiUrl={settings.apiUrl}
      />

      <VFSModal
        isOpen={isVFSOpen}
        onClose={() => setIsVFSOpen(false)}
        showToast={showToast}
        isExportDisabled={settings.exportMode === 'disabled'}
        onInjectToContext={(attachment) => {
          window.dispatchEvent(new CustomEvent('inject-attachment', { detail: attachment }));
          showToast(`已将 "${attachment.name}" 注入当前对话 Context`, 'success');
        }}
      />

      <LegalNoticeModal
        isOpen={isExportLegalNoticeOpen}
        onClose={() => setIsExportLegalNoticeOpen(false)}
        type="export_notice"
        isExportPrompt={true}
        onSelectExportMode={(choice) => {
          setIsExportLegalNoticeOpen(false);
          setSettings({ ...settings, exportMode: choice });
          if (choice !== 'disabled') {
            setIsExportOpen(true);
            showToast('导出授权配置成功', 'success');
          } else {
            showToast('已关闭导出功能。所有下载按钮已隐藏，可在“设置 -> 导出与合规”中重新配置。', 'info');
          }
        }}
      />

      <FirstTimeConsentModal
        isOpen={!hasAgreedLegal}
        onAgree={() => setHasAgreedLegal(true)}
      />

      {/* UI Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/95 dark:bg-[#2c2c2e]/95 backdrop-blur-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-2xl text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-100 max-w-md w-[90%]"
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            ) : toast.type === 'warning' ? (
              <Zap className="w-5 h-5 text-amber-500 fill-amber-500 shrink-0" />
            ) : toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-blue-500 shrink-0" />
            )}
            <span className="flex-1 text-left leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
