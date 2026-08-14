import { motion, AnimatePresence } from 'motion/react';
import { X, Server, SlidersHorizontal, ChevronDown, Plus, Trash2, Wrench, Globe, Terminal, Key, Download, Upload, AlertTriangle, Palette, Sun, Moon, Monitor, LayoutGrid, ChevronUp, Eye, EyeOff, RotateCcw, Volume2, Mic, GitFork, Pin, Copy, Zap, Brain, Settings, RotateCw, ChevronsLeftRight, GripVertical, Check, Tablet, Smartphone, Maximize2, PieChart, BarChart3, TrendingUp, MessageSquare, ChevronRight, ArrowLeft, ShieldCheck, ExternalLink, FileText, Info, Github, HardDrive } from 'lucide-react';
import { AppSettings, ToolbarItemConfig, Chat, ExportMode } from '../types';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { detectProtocol, Protocol } from '../services/llm-engine';
import { Image, Video, Sparkles } from 'lucide-react';
import { DEFAULT_BUBBLE_TOOLS, DEFAULT_HEADER_TOOLS, sanitizeToolbarConfig } from '../utils/toolbar-defaults';
import { useDeviceScreen } from '../hooks/useDeviceScreen';
import { downloadWithAIGCMetadata } from '../utils/aigc-metadata';
import { customConfirm, customAlert } from '../services/dialogService';
import { clearVFS } from '../utils/vfs';
import { LegalNoticeModal, LegalDocType } from './LegalNoticeModal';
import { PRIVACY_POLICY_URL } from '../constants/legalDocs';
import { useTranslation, Language } from '../i18n';

export type SettingsTab = 'provider' | 'media' | 'parameters' | 'tools' | 'remote' | 'appearance' | 'backup' | 'usage' | 'legal' | 'about';

export interface SettingsMenuGroup {
  id: string;
  label: string;
  icon: any;
  items: {
    id: SettingsTab;
    label: string;
    icon: any;
    desc: string;
  }[];
}

export const SETTINGS_MENU_GROUPS: SettingsMenuGroup[] = [
  {
    id: 'models',
    label: '模型与服务',
    icon: Server,
    items: [
      { id: 'provider', label: '模型供应商', icon: Server, desc: 'API Key 与服务终节点' },
      { id: 'media', label: '媒体生成', icon: Sparkles, desc: '生图与视频 API 扩展' },
      { id: 'remote', label: '远程服务器', icon: Globe, desc: '远程连接与 MCP 协议' },
      { id: 'usage', label: '用量统计', icon: PieChart, desc: '消耗统计与配额限制' },
    ],
  },
  {
    id: 'chat',
    label: '对话与体验',
    icon: SlidersHorizontal,
    items: [
      { id: 'parameters', label: '对话参数', icon: SlidersHorizontal, desc: '温度、Token 与上下文' },
      { id: 'tools', label: '工具扩展', icon: Wrench, desc: '代码执行与内置工具' },
      { id: 'appearance', label: '外观设置', icon: Palette, desc: '主题模式与语音输入' },
    ],
  },
  {
    id: 'about_group',
    label: '关于 NeaiChat',
    icon: Info,
    items: [
      { id: 'about', label: '关于项目', icon: Sparkles, desc: '项目详情、Logo 与开源协议' },
    ],
  },
];

const SETTINGS_TABS = [
  { id: 'provider', label: '模型供应商', icon: Server, desc: 'API Key 与服务终节点' },
  { id: 'usage', label: '用量统计', icon: PieChart, desc: '消耗统计与配额限制' },
  { id: 'media', label: '媒体生成', icon: Sparkles, desc: '生图与视频 API 扩展' },
  { id: 'parameters', label: '对话参数', icon: SlidersHorizontal, desc: '温度、Token 与上下文' },
  { id: 'tools', label: '工具扩展', icon: Wrench, desc: '代码执行与内置工具' },
  { id: 'remote', label: '远程服务器', icon: Globe, desc: '远程连接与 MCP 协议' },
  { id: 'appearance', label: '外观设置', icon: Palette, desc: '主题模式与语音输入' },
  { id: 'backup', label: '备份与恢复', icon: Download, desc: '配置数据导入与导出' },
  { id: 'legal', label: '导出与合规', icon: ShieldCheck, desc: '导出许可、水印与法律协议' },
  { id: 'about', label: '关于项目', icon: Sparkles, desc: '项目详情、Logo 与开源协议' },
] as const;

const PROVIDER_PRESETS = [
  { id: 'openai', name: 'OpenAI', url: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', protocol: 'openai' },
  { id: 'anthropic', name: 'Anthropic', url: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet-20241022', protocol: 'anthropic' },
  { id: 'gemini', name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-1.5-flash', protocol: 'gemini' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', protocol: 'openai' },
  { id: 'moonshot', name: 'Moonshot (月之暗面)', url: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k', protocol: 'openai' },
  { id: 'groq', name: 'Groq', url: 'https://api.groq.com/openai/v1', defaultModel: 'llama3-8b-8192', protocol: 'openai' },
  { id: 'siliconflow', name: 'SiliconFlow (硅基流动)', url: 'https://api.siliconflow.cn/v1', defaultModel: 'deepseek-ai/DeepSeek-V2.5', protocol: 'openai' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  chats?: Chat[];
  initialTab?: SettingsTab;
  onToggleStudio?: () => void;
}

export function SettingsModal({ isOpen, onClose, settings, onSave, chats = [], initialTab = 'provider', onToggleStudio }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [mobileView, setMobileView] = useState<'main' | 'detail'>('detail');
  const [viewingLegalDoc, setViewingLegalDoc] = useState<LegalDocType | null>(null);
  const screen = useDeviceScreen();
  const { t, language, setLanguage } = useTranslation();
  
  const versionClickCount = useRef(0);
  const lastClickTime = useRef(0);

  const handleVersionClick = () => {
    const now = Date.now();
    if (now - lastClickTime.current > 1000) {
      versionClickCount.current = 0;
    }
    lastClickTime.current = now;
    versionClickCount.current++;
    
    if (versionClickCount.current >= 12) {
      onToggleStudio?.();
      versionClickCount.current = 0;
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      // 默认打开到主菜单（列表页），除非 initialTab 不是默认的 provider
      if (!isPadLayout && (initialTab === 'provider')) {
        setMobileView('main');
      } else {
        setMobileView('detail');
      }
    }
  }, [isOpen, initialTab]);

  // Auto-save settings whenever localSettings changes
  useEffect(() => {
    onSave(localSettings);
  }, [localSettings, onSave]);

  const menuGroups: SettingsMenuGroup[] = useMemo(() => [
    {
      id: 'models',
      label: t('menu_models_and_services', '模型与服务'),
      icon: Server,
      items: [
        { id: 'provider', label: t('tab_provider', '模型供应商'), icon: Server, desc: t('tab_provider_desc', 'API Key 与服务终节点') },
        { id: 'media', label: t('tab_media', '媒体生成'), icon: Sparkles, desc: t('tab_media_desc', '生图与视频 API 扩展') },
        { id: 'remote', label: t('tab_remote', '远程服务器'), icon: Globe, desc: t('tab_remote_desc', '远程连接与 MCP 协议') },
        { id: 'usage', label: t('tab_usage', '用量统计'), icon: PieChart, desc: t('tab_usage_desc', '消耗统计与配额限制') },
      ],
    },
    {
      id: 'chat',
      label: t('menu_chat_and_experience', '对话与体验'),
      icon: SlidersHorizontal,
      items: [
        { id: 'parameters', label: t('tab_parameters', '对话参数'), icon: SlidersHorizontal, desc: t('tab_parameters_desc', '温度、Token 与上下文') },
        { id: 'tools', label: t('tab_tools', '工具扩展'), icon: Wrench, desc: t('tab_tools_desc', '代码执行与内置工具') },
        { id: 'appearance', label: t('tab_appearance', '外观设置'), icon: Palette, desc: t('tab_appearance_desc', '主题模式与语音输入') },
      ],
    },
    {
      id: 'about_group',
      label: t('menu_about_neaichat', '关于 NeaiChat'),
      icon: Info,
      items: [
        { id: 'about', label: t('tab_about', '关于项目'), icon: Sparkles, desc: t('tab_about_desc', '项目详情、Logo 与开源协议') },
      ],
    },
  ], [t]);

  const settingsTabs = useMemo(() => [
    { id: 'provider', label: t('tab_provider', '模型供应商'), icon: Server, desc: t('tab_provider_desc', 'API Key 与服务终节点') },
    { id: 'usage', label: t('tab_usage', '用量统计'), icon: PieChart, desc: t('tab_usage_desc', '消耗统计与配额限制') },
    { id: 'media', label: t('tab_media', '媒体生成'), icon: Sparkles, desc: t('tab_media_desc', '生图与视频 API 扩展') },
    { id: 'parameters', label: t('tab_parameters', '对话参数'), icon: SlidersHorizontal, desc: t('tab_parameters_desc', '温度、Token 与上下文') },
    { id: 'tools', label: t('tab_tools', '工具扩展'), icon: Wrench, desc: t('tab_tools_desc', '代码执行与内置工具') },
    { id: 'remote', label: t('tab_remote', '远程服务器'), icon: Globe, desc: t('tab_remote_desc', '远程连接与 MCP 协议') },
    { id: 'appearance', label: t('tab_appearance', '外观设置'), icon: Palette, desc: t('tab_appearance_desc', '主题模式与语音输入') },
    { id: 'backup', label: t('tab_backup', '备份与恢复'), icon: Download, desc: t('tab_backup_desc', '配置数据导入与导出') },
    { id: 'legal', label: t('tab_legal', '导出与合规'), icon: ShieldCheck, desc: t('tab_legal_desc', '导出许可、水印与法律协议') },
    { id: 'about', label: t('tab_about', '关于项目'), icon: Sparkles, desc: t('tab_about_desc', '项目详情、Logo 与开源协议') },
  ], [t]);

  const currentParentGroup = useMemo(() => {
    return menuGroups.find(group => 
      group.items.some(item => item.id === activeTab)
    );
  }, [menuGroups, activeTab]);

  const currentSubItem = useMemo(() => {
    return settingsTabs.find(tab => tab.id === activeTab);
  }, [settingsTabs, activeTab]);

  // Screen data layout classification: Pad or Unfolded Foldable or wide viewport
  const isPadLayout = screen.isPad || (screen.isFoldable && !screen.isFolded) || screen.width >= 640;
  const bubbleTools = sanitizeToolbarConfig(localSettings.bubbleToolsConfig, DEFAULT_BUBBLE_TOOLS);
  const headerTools = sanitizeToolbarConfig(localSettings.headerToolsConfig, DEFAULT_HEADER_TOOLS);

  const [draggedBubbleIndex, setDraggedBubbleIndex] = useState<number | null>(null);
  const [dragOverBubbleIndex, setDragOverBubbleIndex] = useState<number | null>(null);

  const [draggedHeaderIndex, setDraggedHeaderIndex] = useState<number | null>(null);
  const [dragOverHeaderIndex, setDragOverHeaderIndex] = useState<number | null>(null);

  const handleBubbleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedBubbleIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleBubbleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverBubbleIndex !== index) {
      setDragOverBubbleIndex(index);
    }
  };

  const handleBubbleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedBubbleIndex === null || draggedBubbleIndex === dropIndex) {
      setDraggedBubbleIndex(null);
      setDragOverBubbleIndex(null);
      return;
    }
    const newTools = [...bubbleTools];
    const [draggedItem] = newTools.splice(draggedBubbleIndex, 1);
    newTools.splice(dropIndex, 0, draggedItem);
    const newSettings = { ...localSettings, bubbleToolsConfig: newTools };
    setLocalSettings(newSettings);
    onSave(newSettings);
    setDraggedBubbleIndex(null);
    setDragOverBubbleIndex(null);
  };

  const handleBubbleDragEnd = () => {
    setDraggedBubbleIndex(null);
    setDragOverBubbleIndex(null);
  };

  const handleHeaderDragStart = (e: React.DragEvent, index: number) => {
    setDraggedHeaderIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleHeaderDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverHeaderIndex !== index) {
      setDragOverHeaderIndex(index);
    }
  };

  const handleHeaderDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedHeaderIndex === null || draggedHeaderIndex === dropIndex) {
      setDraggedHeaderIndex(null);
      setDragOverHeaderIndex(null);
      return;
    }
    const newTools = [...headerTools];
    const [draggedItem] = newTools.splice(draggedHeaderIndex, 1);
    newTools.splice(dropIndex, 0, draggedItem);
    const newSettings = { ...localSettings, headerToolsConfig: newTools };
    setLocalSettings(newSettings);
    onSave(newSettings);
    setDraggedHeaderIndex(null);
    setDragOverHeaderIndex(null);
  };

  const handleHeaderDragEnd = () => {
    setDraggedHeaderIndex(null);
    setDragOverHeaderIndex(null);
  };

  const handleMoveBubbleTool = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= bubbleTools.length) return;
    const newTools = [...bubbleTools];
    const [removed] = newTools.splice(index, 1);
    newTools.splice(targetIndex, 0, removed);
    const newSettings = { ...localSettings, bubbleToolsConfig: newTools };
    setLocalSettings(newSettings);
    onSave(newSettings);
  };

  const handleToggleBubbleToolVisibility = (index: number) => {
    const newTools = [...bubbleTools];
    newTools[index] = { ...newTools[index], visible: !newTools[index].visible };
    const newSettings = { ...localSettings, bubbleToolsConfig: newTools };
    setLocalSettings(newSettings);
    onSave(newSettings);
  };

  const handleResetBubbleTools = () => {
    const newSettings = {
      ...localSettings,
      bubbleToolsConfig: DEFAULT_BUBBLE_TOOLS.map(item => ({ ...item }))
    };
    setLocalSettings(newSettings);
    onSave(newSettings);
  };

  const handleMoveHeaderTool = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= headerTools.length) return;
    const newTools = [...headerTools];
    const [removed] = newTools.splice(index, 1);
    newTools.splice(targetIndex, 0, removed);
    const newSettings = { ...localSettings, headerToolsConfig: newTools };
    setLocalSettings(newSettings);
    onSave(newSettings);
  };

  const handleToggleHeaderToolVisibility = (index: number) => {
    const newTools = [...headerTools];
    newTools[index] = { ...newTools[index], visible: !newTools[index].visible };
    const newSettings = { ...localSettings, headerToolsConfig: newTools };
    setLocalSettings(newSettings);
    onSave(newSettings);
  };

  const handleResetHeaderTools = () => {
    const newSettings = {
      ...localSettings,
      headerToolsConfig: DEFAULT_HEADER_TOOLS.map(item => ({ ...item }))
    };
    setLocalSettings(newSettings);
    onSave(newSettings);
  };

  const handleResetAllToolbars = () => {
    const newSettings = {
      ...localSettings,
      bubbleToolsConfig: DEFAULT_BUBBLE_TOOLS.map(item => ({ ...item })),
      headerToolsConfig: DEFAULT_HEADER_TOOLS.map(item => ({ ...item }))
    };
    setLocalSettings(newSettings);
    onSave(newSettings);
  };

  const getToolIcon = (id: string) => {
    switch (id) {
      case 'version_switch': return <ChevronsLeftRight className="w-4 h-4 text-brand dark:text-brand-dark" />;
      case 'regenerate': return <RotateCcw className="w-4 h-4 text-amber-500" />;
      case 'speak': return <Volume2 className="w-4 h-4 text-blue-500" />;
      case 'branch': return <GitFork className="w-4 h-4 text-purple-500" />;
      case 'pin': return <Pin className="w-4 h-4 text-emerald-500" />;
      case 'copy': return <Copy className="w-4 h-4 text-indigo-500" />;
      case 'delete': return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'vfs': return <HardDrive className="w-4 h-4 text-brand dark:text-brand-dark" />;
      case 'compress': return <Zap className="w-4 h-4 text-amber-500" />;
      case 'prompt_library': return <Brain className="w-4 h-4 text-purple-500" />;
      case 'export_chat': return <Download className="w-4 h-4 text-brand dark:text-brand-dark" />;
      case 'settings': return <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
      case 'new_chat': return <Plus className="w-4 h-4 text-emerald-500" />;
      case 'clear_all': return <Trash2 className="w-4 h-4 text-rose-500" />;
      default: return <Wrench className="w-4 h-4 text-gray-400" />;
    }
  };
  const [selectedPreset, setSelectedPreset] = useState<string>(PROVIDER_PRESETS[0].id);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [selectedImagePreset, setSelectedImagePreset] = useState<string>('openai');
  const [isImageDropdownOpen, setIsImageDropdownOpen] = useState(false);
  const [selectedVideoPreset, setSelectedVideoPreset] = useState<string>('openai');
  const [isVideoDropdownOpen, setIsVideoDropdownOpen] = useState(false);
  const [availableImageModels, setAvailableImageModels] = useState<string[]>([]);
  const [isFetchingImageModels, setIsFetchingImageModels] = useState(false);
  const [availableVideoModels, setAvailableVideoModels] = useState<string[]>([]);
  const [isFetchingVideoModels, setIsFetchingVideoModels] = useState(false);
  const [showCustomModelInput, setShowCustomModelInput] = useState(false);
  const [showImageGenConfig, setShowImageGenConfig] = useState(false);
  const [showVideoGenConfig, setShowVideoGenConfig] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      if (settings.imageGen?.id) {
        setSelectedImagePreset(settings.imageGen.id);
      }
      if (settings.videoGen?.id) {
        setSelectedVideoPreset(settings.videoGen.id);
      }
    }
  }, [isOpen, settings]);

  const fetchModels = useCallback(async () => {
    if (!localSettings.apiUrl || !localSettings.apiKey) {
      setAvailableModels([]);
      return;
    }

    setIsFetchingModels(true);
    try {
      const protocol = await detectProtocol(localSettings);
      let models: string[] = [];

      if (protocol === Protocol.OPENAI) {
        let baseUrl = localSettings.apiUrl.trim().replace(/\/+$/, '');
        if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/chat/completions')) baseUrl += '/v1';
        const url = baseUrl.includes('/chat/completions') 
          ? baseUrl.replace('/chat/completions', '/models') 
          : `${baseUrl}/models`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${localSettings.apiKey.trim()}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.data)) {
            models = data.data.map((m: any) => m.id);
          }
        } else {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error?.message || err.message || `API 请求失败: ${response.status}`);
        }
      } else if (protocol === Protocol.GEMINI) {
        let baseUrl = localSettings.apiUrl.trim().replace(/\/+$/, '');
        if (baseUrl.includes('/chat/completions')) baseUrl = baseUrl.replace('/chat/completions', '');
        if (baseUrl.endsWith('/v1beta')) baseUrl = baseUrl.replace('/v1beta', '');
        if (baseUrl.endsWith('/v1')) baseUrl = baseUrl.replace('/v1', '');
        if (!baseUrl || baseUrl.includes('generativelanguage.googleapis.com')) {
          baseUrl = 'https://generativelanguage.googleapis.com';
        }
        
        const url = `${baseUrl}/v1beta/models?key=${localSettings.apiKey.trim()}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.models)) {
            models = data.models
              .filter((m: any) => m.name.startsWith('models/'))
              .map((m: any) => m.name.replace('models/', ''));
          }
        } else {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error?.message || err.message || `API 请求失败: ${response.status}`);
        }
      }

      // Sort and filter duplicates
      const uniqueModels = Array.from(new Set(models)).sort();
      setAvailableModels(uniqueModels);
      
      // If current model is not in fetched models, show custom input
      if (localSettings.model && !uniqueModels.includes(localSettings.model)) {
        setShowCustomModelInput(true);
      }
    } catch (error: any) {
      console.warn('Failed to fetch models:', error);
      customAlert(`刷新模型列表失败: ${error.message || String(error)}`);
      setAvailableModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  }, [localSettings.apiUrl, localSettings.apiKey, localSettings.model]);

  const fetchMediaModels = useCallback(async (type: 'image' | 'video') => {
    const config = type === 'image' ? localSettings.imageGen : localSettings.videoGen;
    const apiUrl = config?.apiUrl || localSettings.apiUrl;
    const apiKey = config?.apiKey || localSettings.apiKey;
    const protocol = config?.protocol || (localSettings.protocol === 'auto' ? undefined : localSettings.protocol);

    if (!apiUrl || !apiKey) {
      if (type === 'image') setAvailableImageModels([]);
      else setAvailableVideoModels([]);
      return;
    }

    if (type === 'image') setIsFetchingImageModels(true);
    else setIsFetchingVideoModels(true);

    try {
      // Logic similar to fetchModels but targeted at media endpoints if they exist, 
      // or just filtering standard model lists for image/video keywords.
      const detectedProtocol = protocol || await detectProtocol({ ...localSettings, apiUrl, apiKey });
      let models: string[] = [];

      if (detectedProtocol === Protocol.OPENAI) {
        let baseUrl = apiUrl.trim().replace(/\/+$/, '');
        if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/chat/completions')) baseUrl += '/v1';
        const url = baseUrl.includes('/chat/completions') 
          ? baseUrl.replace('/chat/completions', '/models') 
          : `${baseUrl}/models`;
        
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.data)) {
            const allModels = data.data.map((m: any) => m.id);
            // Filter for media models
            if (type === 'image') {
              models = allModels.filter((m: string) => m.includes('dall-e') || m.includes('stable-diffusion') || m.includes('flux') || m.includes('midjourney'));
            } else {
              models = allModels.filter((m: string) => m.includes('sora') || m.includes('luma') || m.includes('runway') || m.includes('kling') || m.includes('video'));
            }
            // If no specific matches, just show all for custom providers
            if (models.length === 0) models = allModels;
          }
        } else {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error?.message || err.message || `API 请求失败: ${response.status}`);
        }
      }

      const uniqueModels = Array.from(new Set(models)).sort();
      if (type === 'image') setAvailableImageModels(uniqueModels);
      else setAvailableVideoModels(uniqueModels);
    } catch (error: any) {
      console.warn(`Failed to fetch ${type} models:`, error);
      customAlert(`刷新${type === 'image' ? '图像' : '视频'}模型列表失败: ${error.message || String(error)}`);
    } finally {
      if (type === 'image') setIsFetchingImageModels(false);
      else setIsFetchingVideoModels(false);
    }
  }, [localSettings.apiUrl, localSettings.apiKey, localSettings.protocol, localSettings.imageGen, localSettings.videoGen]);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'provider') fetchModels();
      if (activeTab === 'media') {
        fetchMediaModels('image');
        fetchMediaModels('video');
      }
    }
  }, [isOpen, activeTab, fetchModels, fetchMediaModels]);

  useEffect(() => {
    const runDetection = async () => {
      if (localSettings.apiUrl) {
        const protocol = await detectProtocol(localSettings);
        if (protocol !== localSettings.protocol) {
          setLocalSettings(prev => ({ ...prev, protocol }));
          
          // Also update custom provider protocol if selected
          if (selectedPreset.startsWith('custom_')) {
            const updatedProviders = (localSettings.customProviders || []).map(p =>
              p.id === selectedPreset ? { ...p, protocol } : p
            );
            setLocalSettings(prev => ({ ...prev, customProviders: updatedProviders }));
          }
        }
      }
    };
    runDetection();
  }, [localSettings.apiUrl, localSettings.model, selectedPreset]);

  const customProviders = localSettings.customProviders || [];
  const allPresets = [...PROVIDER_PRESETS, ...customProviders];

  const handlePresetChange = (newPresetId: string) => {
    // Save current key to old preset before switching
    const updatedApiKeys = {
      ...(localSettings.apiKeys || {}),
      [selectedPreset]: localSettings.apiKey
    };

    const nextApiKey = updatedApiKeys[newPresetId] || '';
    setSelectedPreset(newPresetId);
    
    const preset = allPresets.find(p => p.id === newPresetId);
    if (preset) {
      setLocalSettings({
        ...localSettings,
        apiUrl: preset.url,
        model: preset.defaultModel || '',
        protocol: (preset as any).protocol || 'auto',
        apiKey: nextApiKey,
        apiKeys: updatedApiKeys
      });
    }
  };

  const handleAddCustomProvider = () => {
    const newId = `custom_${Date.now()}`;
    const newProvider = {
      id: newId,
      name: `自定义配置 ${customProviders.length + 1}`,
      url: '',
      defaultModel: ''
    };
    
    const updatedApiKeys = {
      ...(localSettings.apiKeys || {}),
      [selectedPreset]: localSettings.apiKey
    };

    setLocalSettings({
      ...localSettings,
      apiUrl: '',
      model: '',
      protocol: 'auto',
      apiKey: '',
      apiKeys: updatedApiKeys,
      customProviders: [...customProviders, newProvider]
    });
    setSelectedPreset(newId);
    setIsDropdownOpen(false);
  };

  const handleDeleteCustomProvider = (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation();
    const newCustomProviders = customProviders.filter(p => p.id !== providerId);
    
    // If deleted the currently selected one, switch to first pre-defined preset
    if (selectedPreset === providerId) {
      handlePresetChange(PROVIDER_PRESETS[0].id);
    }

    const newApiKeys = { ...(localSettings.apiKeys || {}) };
    delete newApiKeys[providerId];

    setLocalSettings({
      ...localSettings,
      customProviders: newCustomProviders,
      apiKeys: newApiKeys
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-black/40 backdrop-blur-md">
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className={`relative flex bg-bg-primary dark:bg-bg-primary-dark w-full h-full shadow-2xl overflow-hidden ${
            isPadLayout
              ? 'flex-row md:max-w-5xl lg:max-w-6xl md:h-[85vh] md:max-h-[850px] md:rounded-[32px] md:border md:border-gray-200/60 md:dark:border-gray-800/60'
              : 'flex-col max-w-full h-full md:max-w-md md:h-[90vh] md:rounded-[28px]'
          }`}
        >
          {/* Pad / Tablet / Unfolded Foldable Sidebar */}
          {isPadLayout ? (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col w-64 lg:w-72 shrink-0 border-r border-gray-200/50 dark:border-gray-800/50 bg-gray-50/70 dark:bg-[#161618]/80 backdrop-blur-xl p-5 justify-between select-none overflow-y-auto"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between px-2 pt-1">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                      <Settings className="w-5 h-5 text-brand dark:text-brand-dark" />
                      {t('settings', '设置')}
                    </h2>
                  </div>
                </div>

                {/* 主菜单与子菜单结构 */}
                <div className="space-y-5">
                  {menuGroups.map((group) => {
                    const GroupIcon = group.icon;
                    const isGroupActive = group.items.some(item => item.id === activeTab);
                    return (
                      <div key={group.id} className="space-y-1.5">
                        {/* 一级主菜单标题 */}
                        <div className={`flex items-center gap-2 px-2 py-1 text-[11px] font-bold tracking-wider uppercase ${
                          isGroupActive ? 'text-brand dark:text-brand-dark' : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          <GroupIcon className="w-3.5 h-3.5" />
                          <span>{group.label}</span>
                        </div>

                        {/* 二级子菜单选项 */}
                        <div className="space-y-1 pl-1">
                          {group.items.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeTab === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setActiveTab(item.id);
                                  setMobileView('detail');
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs lg:text-sm font-medium transition-all cursor-pointer text-left min-h-[44px] ${
                                  isActive
                                    ? 'bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark font-bold border border-brand/20 dark:border-brand-dark/30 shadow-xs'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`p-1.5 rounded-xl transition-colors shrink-0 ${
                                    isActive
                                      ? 'bg-brand dark:bg-brand-dark text-white'
                                      : 'bg-gray-200/60 dark:bg-gray-800 text-gray-500'
                                  }`}>
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  <span className="truncate">{item.label}</span>
                                </div>
                                {isActive && (
                                  <ChevronRight className="w-3.5 h-3.5 text-brand dark:text-brand-dark shrink-0 ml-1" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : (
            /* Compact / Mobile Header */
            <div className="flex flex-col border-b border-gray-200/50 dark:border-gray-800/50 bg-white/70 dark:bg-black/70 backdrop-blur-xl shrink-0">
              <div className="flex items-center justify-between p-4 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {mobileView === 'detail' ? (
                    <button
                      onClick={() => setMobileView('main')}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl transition-all cursor-pointer mr-1 shrink-0"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      {t('main_menu', '主菜单')}
                    </button>
                  ) : null}
                  <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white truncate">
                    {mobileView === 'main' ? t('settings', '设置') : currentSubItem?.label || t('settings', '设置')}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {mobileView === 'detail' && (
                <div className="flex items-center gap-2 px-4 pt-1 pb-2 overflow-x-auto no-scrollbar scroll-smooth">
                  {settingsTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`pb-2 text-xs font-medium transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                          isActive
                            ? 'border-brand dark:border-brand-dark text-brand dark:text-brand-dark font-bold'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Right Main Content Pane */}
          <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-bg-primary dark:bg-bg-primary-dark">
            {/* Header on Main Pane (For Pad Layout) */}
            {isPadLayout && (
              <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200/40 dark:border-gray-800/40 bg-white/40 dark:bg-black/20 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  {currentSubItem && (
                    <>
                      <div className="p-2.5 rounded-2xl bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark shrink-0">
                        <currentSubItem.icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 font-medium">
                          <span>{t('settings', '设置')}</span>
                          <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
                          <span>{currentParentGroup?.label}</span>
                          <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
                          <span className="text-gray-700 dark:text-gray-300 font-semibold">{currentSubItem.label}</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight mt-0.5 truncate">
                          {currentSubItem.label}
                        </h3>
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="p-2.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            )}

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 flex justify-center w-full">
              <div className="w-full max-w-3xl space-y-8">
                {!isPadLayout && mobileView === 'main' ? (
                  /* 移动端主菜单列表概览 */
                  <div className="space-y-6 py-2">
                    <div className="text-center space-y-1">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('settings_categories', '设置分类')}</h3>
                      <p className="text-xs text-gray-400">{t('settings_categories_desc', '请选择要配置的主菜单分类及对应功能')}</p>
                    </div>

                    <div className="space-y-4">
                      {menuGroups.map((group) => {
                        const GroupIcon = group.icon;
                        return (
                          <div key={group.id} className="bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-gray-800 rounded-3xl p-5 shadow-xs space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-brand dark:text-brand-dark uppercase tracking-wider border-b border-gray-100 dark:border-gray-800/60 pb-3">
                              <GroupIcon className="w-4 h-4" />
                              <span>{group.label}</span>
                            </div>
                            <div className="grid grid-cols-1 gap-2 pt-1">
                              {group.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                  <button
                                    key={item.id}
                                    onClick={() => {
                                      setActiveTab(item.id);
                                      setMobileView('detail');
                                    }}
                                    className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 active:scale-[0.99] transition-all text-left cursor-pointer group border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 group-hover:bg-brand group-hover:text-white transition-colors shrink-0">
                                        <Icon className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{item.label}</div>
                                        <div className="text-[11px] text-gray-400 truncate">{item.desc}</div>
                                      </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-brand transition-colors shrink-0 ml-2" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : activeTab === 'usage' ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                {/* Usage Overview Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { 
                      label: t('total_tokens_consumed', '累计 Token 消耗'), 
                      value: chats.reduce((acc, c) => acc + (c.usage?.totalTokens || 0), 0).toLocaleString(), 
                      icon: Zap, 
                      color: 'text-brand dark:text-brand-dark',
                      bg: 'bg-brand/10 dark:bg-brand-dark/20'
                    },
                    { 
                      label: t('avg_tokens_per_chat', '平均每会话消耗'), 
                      value: chats.length > 0 
                        ? Math.round(chats.reduce((acc, c) => acc + (c.usage?.totalTokens || 0), 0) / chats.length).toLocaleString() 
                        : '0', 
                      icon: TrendingUp, 
                      color: 'text-emerald-500',
                      bg: 'bg-emerald-50 dark:bg-emerald-900/20'
                    },
                    { 
                      label: t('total_chats_count', '对话总数'), 
                      value: chats.length.toString(), 
                      icon: MessageSquare, 
                      color: 'text-purple-500',
                      bg: 'bg-purple-50 dark:bg-purple-900/20'
                    },
                  ].map((stat, i) => (
                    <div key={i} className="p-6 bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-gray-800 rounded-3xl shadow-sm space-y-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
                        <stat.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{stat.label}</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 font-mono">{stat.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quota Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between ml-1">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-brand" />
                      {t('current_quota_status', '当前配额状态')}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{t('set_token_limit', '设置限额 (Tokens):')}</span>
                      <input 
                        type="number"
                        value={localSettings.usageLimit || 1000000}
                        onChange={(e) => setLocalSettings({ ...localSettings, usageLimit: parseInt(e.target.value) || 0 })}
                        className="w-32 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-brand/50 font-mono font-bold"
                        step="100000"
                        min="0"
                      />
                    </div>
                  </div>
                  <div className="p-6 bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-gray-800 rounded-3xl shadow-sm space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400 font-medium">{t('quota_usage_rate', '额度使用率')}</span>
                        <span className="text-brand dark:text-brand-dark font-bold font-mono">
                          {Math.min(100, Math.round((chats.reduce((acc, c) => acc + (c.usage?.totalTokens || 0), 0) / (localSettings.usageLimit || 1000000)) * 100))}%
                        </span>
                      </div>
                      <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (chats.reduce((acc, c) => acc + (c.usage?.totalTokens || 0), 0) / (localSettings.usageLimit || 1000000)) * 100)}%` }}
                          className="h-full bg-brand dark:bg-brand-dark rounded-full shadow-lg shadow-brand/20"
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
                        <span>0 Tokens</span>
                        <span>{(localSettings.usageLimit || 1000000).toLocaleString()} Tokens ({t('custom_limit', '自定义上限')})</span>
                      </div>
                    </div>

                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl flex gap-3 items-start">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-amber-800 dark:text-amber-400">{t('about_usage_stats', '关于用量统计')}</p>
                        <p className="text-xs text-amber-700/80 dark:text-amber-400/70 leading-relaxed">
                          {t('usage_stats_disclaimer', '此统计仅基于您在本设备上的历史对话。实际账单用量请以模型服务商（如 OpenAI, Google Cloud）后台控制台为准。')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Chats Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between ml-1">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-emerald-500" />
                      {t('top_usage_chats', '高消耗对话排行')}
                    </h3>
                  </div>
                  <div className="overflow-hidden bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-gray-800 rounded-3xl shadow-sm">
                    {chats
                      .filter(c => c.usage?.totalTokens)
                      .sort((a, b) => (b.usage?.totalTokens || 0) - (a.usage?.totalTokens || 0))
                      .slice(0, 5)
                      .map((chat, idx) => (
                        <div key={chat.id} className={`flex items-center justify-between p-4 ${idx !== 0 ? 'border-t border-gray-50 dark:border-gray-800/50' : ''}`}>
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                              {idx + 1}
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{chat.title}</span>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span className="text-sm font-bold text-gray-900 dark:text-white font-mono">
                              {chat.usage?.totalTokens.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium">Tokens</span>
                          </div>
                        </div>
                      ))}
                    {chats.filter(c => c.usage?.totalTokens).length === 0 && (
                      <div className="p-10 text-center text-sm text-gray-400 italic">
                        {t('no_usage_stats', '暂无对话消耗统计数据')}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'appearance' ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('theme_mode', '主题模式')}</h3>
                    <p className="text-sm text-gray-500 mt-1">{t('theme_mode_desc', '选择您喜欢的界面外观。')}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: 'light', name: t('light', '亮色'), icon: Sun },
                      { id: 'dark', name: t('dark', '暗色'), icon: Moon },
                      { id: 'system', name: t('follow_system', '跟随系统'), icon: Monitor },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          const newSettings = { ...localSettings, themeMode: mode.id as any };
                          setLocalSettings(newSettings);
                          onSave(newSettings);
                        }}
                        className={`flex flex-col items-center justify-center p-6 bg-white dark:bg-[#1c1c1e] border-2 rounded-3xl transition-all group cursor-pointer ${
                          localSettings.themeMode === mode.id
                            ? 'border-brand dark:border-brand-dark bg-brand/5 dark:bg-brand-dark/5'
                            : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
                          localSettings.themeMode === mode.id
                            ? 'bg-brand dark:bg-brand-dark text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                        }`}>
                          <mode.icon className="w-6 h-6" />
                        </div>
                        <span className={`font-bold ${
                          localSettings.themeMode === mode.id
                            ? 'text-brand dark:text-brand-dark'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {mode.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-gray-200/50 dark:border-gray-800/50">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('language', '界面语言')}</h3>
                    <p className="text-sm text-gray-500 mt-1">{t('language_desc', '选择多语言界面展示。')}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: 'zh-CN', name: '简体中文', flag: 'ZH' },
                      { id: 'en-US', name: 'English', flag: 'EN' },
                      { id: 'ja-JP', name: '日本語', flag: 'JA' },
                    ].map((langItem) => (
                      <button
                        key={langItem.id}
                        type="button"
                        onClick={() => {
                          setLanguage(langItem.id as Language);
                        }}
                        className={`flex items-center gap-3 p-5 bg-white dark:bg-[#1c1c1e] border-2 rounded-3xl transition-all group cursor-pointer text-left ${
                          language === langItem.id
                            ? 'border-brand dark:border-brand-dark bg-brand/5 dark:bg-brand-dark/5'
                            : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                          language === langItem.id
                            ? 'bg-brand dark:bg-brand-dark text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                        }`}>
                          {langItem.flag}
                        </div>
                        <span className={`font-bold block text-sm ${
                          language === langItem.id
                            ? 'text-brand dark:text-brand-dark'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {langItem.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-gray-200/50 dark:border-gray-800/50">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('voice_input_button', '语音按钮')}</h3>
                    <p className="text-sm text-gray-500 mt-1">{t('voice_button_mode_desc', '控制聊天输入框中语音按钮的显示方式。')}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: 'auto', name: t('auto', '自动'), desc: t('voice_auto_desc', '根据支持情况自动显示'), icon: Sparkles },
                      { id: 'on', name: t('on', '开启'), desc: t('voice_button_always_show', '始终显示语音按钮'), icon: Mic },
                      { id: 'off', name: t('off', '关闭'), desc: t('voice_button_always_hide', '始终隐藏语音按钮'), icon: EyeOff },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          const newSettings = { ...localSettings, voiceButtonMode: mode.id as any };
                          setLocalSettings(newSettings);
                          onSave(newSettings);
                        }}
                        className={`flex flex-col items-start p-5 bg-white dark:bg-[#1c1c1e] border-2 rounded-3xl transition-all group cursor-pointer text-left ${
                          (localSettings.voiceButtonMode || 'auto') === mode.id
                            ? 'border-brand dark:border-brand-dark bg-brand/5 dark:bg-brand-dark/5'
                            : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                          (localSettings.voiceButtonMode || 'auto') === mode.id
                            ? 'bg-brand dark:bg-brand-dark text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                        }`}>
                          <mode.icon className="w-5 h-5" />
                        </div>
                        <span className={`font-bold block ${
                          (localSettings.voiceButtonMode || 'auto') === mode.id
                            ? 'text-brand dark:text-brand-dark'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {mode.name}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 line-clamp-1">
                          {mode.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-gray-200/50 dark:border-gray-800/50">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('startup_behavior', '启动行为')}</h3>
                    <p className="text-sm text-gray-500 mt-1">{t('startup_behavior_desc', '选择打开应用时的默认操作。')}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { id: 'last', name: t('continue_last_chat', '继续上个对话'), desc: t('continue_last_chat_desc', '自动打开最近一次的对话记录'), icon: MessageSquare },
                      { id: 'new', name: t('start_new_chat', '开启新对话'), desc: t('start_new_chat_desc', '每次打开应用都进入空白新对话'), icon: Plus },
                    ].map((behavior) => (
                      <button
                        key={behavior.id}
                        type="button"
                        onClick={() => {
                          const newSettings = { ...localSettings, startupBehavior: behavior.id as any };
                          setLocalSettings(newSettings);
                          onSave(newSettings);
                        }}
                        className={`flex items-center gap-4 p-5 bg-white dark:bg-[#1c1c1e] border-2 rounded-3xl transition-all group cursor-pointer text-left ${
                          (localSettings.startupBehavior || 'last') === behavior.id
                            ? 'border-brand dark:border-brand-dark bg-brand/5 dark:bg-brand-dark/5 shadow-md'
                            : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                        }`}
                      >
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shrink-0 ${
                          (localSettings.startupBehavior || 'last') === behavior.id
                            ? 'bg-brand dark:bg-brand-dark text-white scale-110 shadow-lg shadow-brand/20'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                        }`}>
                          <behavior.icon className="w-7 h-7" />
                        </div>
                        <div className="flex-1 min-w-0 pr-2">
                          <span className={`font-bold block text-sm sm:text-base leading-tight ${
                            (localSettings.startupBehavior || 'last') === behavior.id
                              ? 'text-brand dark:text-brand-dark'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}>
                            {behavior.name}
                          </span>
                          <span className="text-[11px] sm:text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2 leading-snug">
                            {behavior.desc}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 界面工具栏定制 */}
                <div className="pt-6 border-t border-gray-200/50 dark:border-gray-800/50 space-y-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-brand dark:text-brand-dark" />
                        {t('interface_toolbar_custom', '界面工具栏定制')}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {t('interface_toolbar_desc', '按住抓手图标（或使用上下箭头）上下拖动卡片即可调整按钮排序，控制各项工具显示与隐藏。')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetAllToolbars}
                      className="self-start sm:self-auto flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-red-600 dark:hover:text-red-400 bg-gray-100 hover:bg-red-50 dark:bg-gray-800/80 dark:hover:bg-red-950/40 border border-gray-200/80 dark:border-gray-700 transition-all cursor-pointer min-h-[36px]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t('restore_all_default', '全部恢复默认')}</span>
                    </button>
                  </div>

                  {/* Section 1: 消息气泡下方工具栏 */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                          <span>{t('bubble_toolbar_title', '消息气泡下方工具栏')}</span>
                          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-brand/10 text-brand dark:bg-brand-dark/20 dark:text-brand-dark">
                            {bubbleTools.filter(t => t.visible).length} / {bubbleTools.length} {t('displayed', '已显示')}
                          </span>
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('bubble_toolbar_desc', '上下拖动列表卡片即可快捷调整对话消息下方工具栏顺序')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetBubbleTools}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-brand dark:hover:text-brand-dark bg-gray-100 dark:bg-gray-800 hover:bg-brand/10 dark:hover:bg-brand-dark/20 rounded-full transition-colors cursor-pointer border border-gray-200/60 dark:border-gray-700/60"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>{t('reset_this_category', '重置此类')}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      {bubbleTools.map((tool, index) => (
                        <div
                          key={tool.id}
                          draggable
                          onDragStart={(e) => handleBubbleDragStart(e, index)}
                          onDragOver={(e) => handleBubbleDragOver(e, index)}
                          onDrop={(e) => handleBubbleDrop(e, index)}
                          onDragEnd={handleBubbleDragEnd}
                          className={`group flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-grab active:cursor-grabbing select-none ${
                            draggedBubbleIndex === index
                              ? 'opacity-30 border-dashed border-brand/60 bg-brand/5 dark:bg-brand-dark/5'
                              : dragOverBubbleIndex === index
                              ? 'border-brand dark:border-brand-dark ring-2 ring-brand/20 dark:ring-brand-dark/20 bg-brand/5 dark:bg-brand-dark/5 scale-[1.01]'
                              : tool.visible
                              ? 'bg-white dark:bg-[#1c1c1e] border-gray-200/80 dark:border-gray-800 shadow-2xs hover:border-gray-300 dark:hover:border-gray-700'
                              : 'bg-gray-50/60 dark:bg-gray-900/40 border-gray-200/40 dark:border-gray-800/40 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors">
                              <GripVertical className="w-4 h-4" />
                            </div>

                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveBubbleTool(index, 'up');
                                }}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                title={t('up_move', '上移')}
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === bubbleTools.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveBubbleTool(index, 'down');
                                }}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                title={t('down_move', '下移')}
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0">
                              {getToolIcon(tool.id)}
                            </div>

                            <div className="flex items-center">
                              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                                {tool.name}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleBubbleToolVisibility(index);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                              tool.visible
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/50 shadow-2xs'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            {tool.visible ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>{t('displayed', '已显示')}</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>{t('hidden', '已隐藏')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 2: 标题右侧工具栏 */}
                  <div className="space-y-4 pt-6 border-t border-gray-200/50 dark:border-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                          <span>{t('header_toolbar_title', '标题栏右侧工具栏')}</span>
                          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-brand/10 text-brand dark:bg-brand-dark/20 dark:text-brand-dark">
                            {headerTools.filter(t => t.visible).length} / {headerTools.length} {t('displayed', '已显示')}
                          </span>
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('header_toolbar_desc', '上下拖动列表卡片即可快捷调整窗口顶部右侧工具栏顺序')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetHeaderTools}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-brand dark:hover:text-brand-dark bg-gray-100 dark:bg-gray-800 hover:bg-brand/10 dark:hover:bg-brand-dark/20 rounded-full transition-colors cursor-pointer border border-gray-200/60 dark:border-gray-700/60"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>{t('reset_this_category', '重置此类')}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      {headerTools.map((tool, index) => (
                        <div
                          key={tool.id}
                          draggable
                          onDragStart={(e) => handleHeaderDragStart(e, index)}
                          onDragOver={(e) => handleHeaderDragOver(e, index)}
                          onDrop={(e) => handleHeaderDrop(e, index)}
                          onDragEnd={handleHeaderDragEnd}
                          className={`group flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-grab active:cursor-grabbing select-none ${
                            draggedHeaderIndex === index
                              ? 'opacity-30 border-dashed border-brand/60 bg-brand/5 dark:bg-brand-dark/5'
                              : dragOverHeaderIndex === index
                              ? 'border-brand dark:border-brand-dark ring-2 ring-brand/20 dark:ring-brand-dark/20 bg-brand/5 dark:bg-brand-dark/5 scale-[1.01]'
                              : tool.visible
                              ? 'bg-white dark:bg-[#1c1c1e] border-gray-200/80 dark:border-gray-800 shadow-2xs hover:border-gray-300 dark:hover:border-gray-700'
                              : 'bg-gray-50/60 dark:bg-gray-900/40 border-gray-200/40 dark:border-gray-800/40 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors">
                              <GripVertical className="w-4 h-4" />
                            </div>

                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveHeaderTool(index, 'up');
                                }}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                title={t('up_move', '上移')}
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === headerTools.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveHeaderTool(index, 'down');
                                }}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                title={t('down_move', '下移')}
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0">
                              {getToolIcon(tool.id)}
                            </div>

                            <div className="flex items-center">
                              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                                {tool.name}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleHeaderToolVisibility(index);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                              tool.visible
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/50 shadow-2xs'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            {tool.visible ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>{t('displayed', '已显示')}</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>{t('hidden', '已隐藏')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'backup' ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('backup_restore_title', '备份与恢复')}</h3>
                    <p className="text-sm text-gray-500 mt-1">{t('backup_restore_desc', '导出或导入您的完整应用配置数据。')}</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('about')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand dark:text-brand-dark bg-brand/10 dark:bg-brand-dark/20 rounded-xl hover:bg-brand/20 transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {t('return_to_about', '返回关于')}
                  </button>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-[24px] border border-amber-200 dark:border-amber-800/50">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-lg shadow-amber-500/20">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400">{t('important_security_notice', '重要安全提示')}</h3>
                      <p className="text-amber-600 dark:text-amber-500/80 mt-1 leading-relaxed text-sm">
                        {t('backup_security_hint', '备份文件包含您的敏感 API 密钥。请妥善保管导出的 JSON 文件，不要将其分享给他人。')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {localSettings.exportMode === 'disabled' ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-gray-100/50 dark:bg-[#161618] border-2 border-gray-200/60 dark:border-gray-800 rounded-3xl text-gray-400">
                      <div className="w-16 h-16 bg-gray-200/50 dark:bg-gray-800/50 rounded-2xl flex items-center justify-center mb-4">
                        <Download className="w-8 h-8 text-gray-400" />
                      </div>
                      <span className="text-lg font-bold text-gray-500">{t('export_feature_disabled', '导出功能已关闭')}</span>
                      <p className="text-sm text-gray-400 mt-2 text-center">{t('export_disabled_desc', '您已在设置中关闭导出功能，可在“导出与合规”标签中重新开启')}</p>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        const jsonStr = JSON.stringify(localSettings, null, 2);
                        const fileName = `ai-assistant-settings-${new Date().toISOString().slice(0, 10)}.json`;
                        await downloadWithAIGCMetadata(jsonStr, fileName, 'application/json');
                      }}
                      className="flex flex-col items-center justify-center p-8 bg-white dark:bg-[#1c1c1e] border-2 border-gray-100 dark:border-gray-800 rounded-3xl hover:border-brand/50 dark:hover:border-brand-dark/50 transition-all group cursor-pointer"
                    >
                      <div className="w-16 h-16 bg-brand/10 dark:bg-brand-dark/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Download className="w-8 h-8 text-brand dark:text-brand-dark" />
                      </div>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">{t('export_config_button', '导出配置 (JSON)')}</span>
                      <p className="text-sm text-gray-500 mt-2 text-center">{t('export_config_desc', '将当前所有配置保存到本地 JSON 文件')}</p>
                    </button>
                  )}

                  <label className="flex flex-col items-center justify-center p-8 bg-white dark:bg-[#1c1c1e] border-2 border-gray-100 dark:border-gray-800 rounded-3xl hover:border-brand/50 dark:hover:border-brand-dark/50 transition-all group cursor-pointer">
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          try {
                            const imported = JSON.parse(event.target?.result as string);
                            if (imported && (imported.apiUrl !== undefined || imported.apiKey !== undefined)) {
                              setLocalSettings(imported);
                              await customAlert(t('import_success', '设置导入成功！已自动应用更改。'));
                            } else {
                              await customAlert(t('import_failed_format', '导入失败：文件格式不正确，缺少必要的配置项。'));
                            }
                          } catch (err) {
                            await customAlert(t('import_failed_parse', '导入失败：文件解析错误，请确保是有效的 JSON 文件。'));
                          }
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                      }}
                    />
                    <div className="w-16 h-16 bg-brand/10 dark:bg-brand-dark/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-8 h-8 text-brand dark:text-brand-dark" />
                    </div>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{t('import_config_button', '导入配置 (JSON)')}</span>
                    <p className="text-sm text-gray-500 mt-2 text-center">{t('import_config_hint', '从本地 JSON 文件恢复配置信息')}</p>
                  </label>
                </div>

                <div className="p-6 bg-rose-50 dark:bg-rose-950/20 rounded-[24px] border border-rose-100 dark:border-rose-900/30 space-y-4">
                  <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                    <Trash2 className="w-5 h-5" />
                    <h4 className="font-bold">{t('danger_zone', '危险区域')}</h4>
                  </div>
                  <p className="text-xs text-rose-600/80 dark:text-rose-400/70 leading-relaxed">
                    {t('clear_data_desc', '清除所有本地存储的数据，包括所有对话记录、API 配置、自定义提示词以及虚拟文件系统中的文件。此操作不可撤销，请谨慎操作。')}
                  </p>
                  <button
                    onClick={async () => {
                      if (!(await customConfirm(t('clear_data_confirm_msg', '确定要清空所有数据吗？此操作将删除所有对话、设置和文件，并重新加载页面。'), { 
                        title: t('danger_clear_data_title', '危险：清空所有数据'),
                        confirmText: t('thorough_clear', '彻底清空')
                      }))) return;
                      
                      try {
                        // 1. Clear IndexedDB (VFS)
                        await clearVFS();
                        // 2. Clear LocalStorage
                        localStorage.clear();
                        // 3. Reload to reset app state
                        window.location.reload();
                      } catch (err) {
                        await customAlert(t('error_clearing_data', '清除数据时出错: ') + (err instanceof Error ? err.message : String(err)), { title: t('error', '错误') });
                      }
                    }}
                    className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('start_thorough_clear', '立即清空所有本地数据')}
                  </button>
                </div>

                <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <h4 className="font-bold text-gray-900 dark:text-white mb-2">{t('backup_includes_desc', '备份包含以下内容：')}</h4>
                  <ul className="text-sm text-gray-500 space-y-2 list-disc list-inside">
                    <li>{t('backup_item_api', '所有模型供应商 API 地址和密钥')}</li>
                    <li>{t('backup_item_params', '对话参数（随机性、长度限制等）')}</li>
                    <li>{t('backup_item_custom', '自定义模型供应商配置')}</li>
                    <li>{t('backup_item_tools', '工具扩展（搜索 API 密钥、MCP 服务器）')}</li>
                    <li>{t('backup_item_ssh', '远程服务器 (SSH) 连接配置')}</li>
                  </ul>
                </div>
              </motion.div>
            ) : activeTab === 'remote' ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('ssh_config_title', 'SSH 远程调用配置')}</h3>
                      <p className="text-sm text-gray-500 mt-1">{t('ssh_config_desc', '配置远程服务器，允许模型通过 SSH 执行命令。')}</p>
                    </div>
                    <button
                      onClick={() => {
                        const newServer = {
                          id: `server_${Date.now()}`,
                          name: t('new_server_name', '新服务器'),
                          host: '',
                          port: 22,
                          username: 'root'
                        };
                        setLocalSettings({
                          ...localSettings,
                          remoteServers: [...(localSettings.remoteServers || []), newServer]
                        });
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-brand dark:bg-brand-dark text-white rounded-xl hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      {t('add_server_button', '添加服务器')}
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                      {t('ssh_bridge_url_label', 'SSH Bridge URL (代理中转地址)')}
                    </label>
                    <div className="relative group">
                      <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-brand transition-colors" />
                      <input
                        type="text"
                        value={localSettings.sshBridgeUrl || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, sshBridgeUrl: e.target.value })}
                        placeholder={t('ssh_bridge_placeholder', '例如: https://your-ssh-bridge.com/api/ssh')}
                        className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-[#1c1c1e] border-2 border-gray-100 dark:border-gray-800 rounded-2xl focus:outline-none focus:border-brand/50 dark:focus:border-brand-dark/50 transition-all text-base shadow-sm"
                      />
                    </div>
                    <p className="text-xs text-gray-500 ml-2">
                      {t('ssh_bridge_hint', '由于系统安全限制，无法直接建立 SSH 连接。你需要一个简单的 Node.js 代理来中转请求。')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    {(localSettings.remoteServers || []).map((server) => (
                      <div key={server.id} className="p-5 bg-white dark:bg-[#1c1c1e] rounded-3xl border-2 border-gray-100 dark:border-gray-800 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-brand/10 dark:bg-brand-dark/20 rounded-lg flex items-center justify-center">
                              <Terminal className="w-4 h-4 text-brand dark:text-brand-dark" />
                            </div>
                            <input
                              type="text"
                              value={server.name}
                              onChange={(e) => {
                                const newServers = (localSettings.remoteServers || []).map(s =>
                                  s.id === server.id ? { ...s, name: e.target.value } : s
                                );
                                setLocalSettings({ ...localSettings, remoteServers: newServers });
                              }}
                              className="bg-transparent font-bold text-sm focus:outline-none border-b border-transparent focus:border-brand/30"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const newServers = (localSettings.remoteServers || []).filter(s => s.id !== server.id);
                              setLocalSettings({ ...localSettings, remoteServers: newServers });
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder={t('host_address', '主机地址')}
                              value={server.host}
                              onChange={(e) => {
                                const newServers = (localSettings.remoteServers || []).map(s =>
                                  s.id === server.id ? { ...s, host: e.target.value } : s
                                );
                                setLocalSettings({ ...localSettings, remoteServers: newServers });
                              }}
                              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-black/20 rounded-xl text-xs border border-gray-100 dark:border-gray-800 focus:outline-none focus:border-brand/30"
                            />
                            <input
                              type="number"
                              placeholder="端口"
                              value={server.port}
                              onChange={(e) => {
                                const newServers = (localSettings.remoteServers || []).map(s =>
                                  s.id === server.id ? { ...s, port: parseInt(e.target.value) || 22 } : s
                                );
                                setLocalSettings({ ...localSettings, remoteServers: newServers });
                              }}
                              className="w-20 px-3 py-2 bg-gray-50 dark:bg-black/20 rounded-xl text-xs border border-gray-100 dark:border-gray-800 focus:outline-none focus:border-brand/30"
                            />
                          </div>
                          <input
                            type="text"
                            placeholder="用户名"
                            value={server.username}
                            onChange={(e) => {
                              const newServers = (localSettings.remoteServers || []).map(s =>
                                s.id === server.id ? { ...s, username: e.target.value } : s
                              );
                              setLocalSettings({ ...localSettings, remoteServers: newServers });
                            }}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-black/20 rounded-xl text-xs border border-gray-100 dark:border-gray-800 focus:outline-none focus:border-brand/30"
                          />
                          <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                              type="password"
                              placeholder="密码或密钥"
                              value={server.password || ''}
                              onChange={(e) => {
                                const newServers = (localSettings.remoteServers || []).map(s =>
                                  s.id === server.id ? { ...s, password: e.target.value } : s
                                );
                                setLocalSettings({ ...localSettings, remoteServers: newServers });
                              }}
                              className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-black/20 rounded-xl text-xs border border-gray-100 dark:border-gray-800 focus:outline-none focus:border-brand/30 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {(localSettings.remoteServers || []).length === 0 && (
                      <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-gray-50/50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800">
                        <Terminal className="w-12 h-12 text-gray-200 dark:text-gray-800 mb-4" />
                        <p className="text-gray-500 dark:text-gray-400">尚未配置任何远程服务器</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'provider' ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="space-y-3">
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                    {t('preset_provider', '预设供应商')}
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="w-full flex items-center justify-between px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 dark:focus:ring-brand-dark/50 transition-shadow text-lg shadow-sm"
                    >
                      <span className="truncate">
                        {allPresets.find(p => p.id === selectedPreset)?.name || t('select_provider_placeholder', '请选择供应商')}
                      </span>
                      <ChevronDown className={`w-5 h-5 text-gray-500 shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {isDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute z-10 w-full mt-2 py-2 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] shadow-lg max-h-[300px] overflow-y-auto flex flex-col"
                        >
                          {allPresets.map((preset) => {
                            const isCustom = preset.id.startsWith('custom_');
                            return (
                              <div
                                key={preset.id}
                                onClick={() => {
                                  handlePresetChange(preset.id);
                                  setIsDropdownOpen(false);
                                }}
                                className="w-full text-left px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-between group cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full ${selectedPreset === preset.id ? 'bg-brand dark:bg-brand-dark' : 'bg-transparent'}`} />
                                  <span className={selectedPreset === preset.id ? 'font-medium text-brand dark:text-brand-dark' : 'text-gray-700 dark:text-gray-300'}>{preset.name}</span>
                                </div>
                                {isCustom && (
                                  <button
                                    onClick={(e) => handleDeleteCustomProvider(e, preset.id)}
                                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-md transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          <div className="px-3 pt-2 mt-2 border-t border-gray-100 dark:border-gray-800/50">
                            <button
                              onClick={handleAddCustomProvider}
                              className="w-full text-left px-4 py-3 text-brand dark:text-brand-dark hover:bg-brand/5 dark:hover:bg-brand-dark/10 rounded-[12px] transition-colors flex items-center gap-2 font-medium"
                            >
                              <Plus className="w-5 h-5" />
                              {t('add_custom_provider_button', '添加自定义配置')}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {selectedPreset.startsWith('custom_') && (
                  <div className="space-y-3">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                      {t('config_name_label', '配置名称')}
                    </label>
                    <input
                      type="text"
                      value={allPresets.find(p => p.id === selectedPreset)?.name || ''}
                      onChange={(e) => {
                        const newName = e.target.value;
                        const newCustomProviders = customProviders.map(p => 
                          p.id === selectedPreset ? { ...p, name: newName } : p
                        );
                        setLocalSettings({ ...localSettings, customProviders: newCustomProviders });
                      }}
                      placeholder={t('config_name_placeholder', '例如: 本地 Llama3')}
                      className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 dark:focus:ring-brand-dark/50 transition-shadow text-lg shadow-sm"
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                    {t('api_type_label', 'API 类型')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'auto', name: t('api_type_auto', '自动识别') },
                      { id: 'openai', name: 'OpenAI' },
                      { id: 'anthropic', name: 'Anthropic' },
                      { id: 'gemini', name: 'Gemini' }
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          const newProtocol = p.id as any;
                          if (selectedPreset.startsWith('custom_')) {
                            const newCustomProviders = customProviders.map(cp => 
                              cp.id === selectedPreset ? { ...cp, protocol: newProtocol === 'auto' ? undefined : newProtocol } : cp
                            );
                            setLocalSettings({ ...localSettings, protocol: newProtocol, customProviders: newCustomProviders });
                          } else {
                            setLocalSettings({ ...localSettings, protocol: newProtocol });
                          }
                        }}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          (localSettings.protocol || 'auto') === p.id
                            ? 'bg-brand dark:bg-brand-dark text-white shadow-md'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {!selectedPreset.startsWith('custom_') ? null : (
                  <div className="space-y-3">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                      {t('api_url_label', 'API 地址')}
                    </label>
                    <input
                      type="text"
                      value={localSettings.apiUrl}
                      onChange={(e) => {
                        const newUrl = e.target.value;
                        if (selectedPreset.startsWith('custom_')) {
                          const newCustomProviders = customProviders.map(p => 
                            p.id === selectedPreset ? { ...p, url: newUrl } : p
                          );
                          setLocalSettings({ ...localSettings, apiUrl: newUrl, customProviders: newCustomProviders });
                        } else {
                          setLocalSettings({ ...localSettings, apiUrl: newUrl });
                        }
                      }}
                      placeholder="https://api.openai.com/v1"
                      className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 dark:focus:ring-brand-dark/50 transition-shadow text-lg shadow-sm"
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                    {t('api_key_label', 'API 密钥')}
                  </label>
                  <input
                    type="password"
                    value={localSettings.apiKey}
                    onChange={(e) => {
                      const newKey = e.target.value;
                      setLocalSettings(prev => ({
                        ...prev,
                        apiKey: newKey,
                        apiKeys: {
                          ...(prev.apiKeys || {}),
                          [selectedPreset]: newKey
                        }
                      }));
                    }}
                    placeholder="sk-..."
                    className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 dark:focus:ring-brand-dark/50 transition-shadow text-lg shadow-sm"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between ml-1">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                      {t('model_name_label', '模型名称')}
                    </label>
                    <div className="flex items-center gap-2">
                      {isFetchingModels && (
                        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                      )}
                      <button
                        onClick={fetchModels}
                        className="text-sm text-brand dark:text-brand-dark hover:underline"
                        disabled={isFetchingModels}
                      >
                        {t('refresh_list_button', '刷新列表')}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      onClick={() => setShowCustomModelInput(!showCustomModelInput)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        showCustomModelInput 
                          ? 'bg-brand dark:bg-brand-dark text-white shadow-md' 
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {t('custom_model_button', '自定义')}
                    </button>
                    {availableModels.length > 0 && availableModels.map(model => (
                      <button
                        key={model}
                        onClick={() => {
                          setShowCustomModelInput(false);
                          const newModel = model;
                          if (selectedPreset.startsWith('custom_')) {
                            const newCustomProviders = customProviders.map(p => 
                              p.id === selectedPreset ? { ...p, defaultModel: newModel } : p
                            );
                            setLocalSettings({ ...localSettings, model: newModel, customProviders: newCustomProviders });
                          } else {
                            setLocalSettings({ ...localSettings, model: newModel });
                          }
                        }}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          !showCustomModelInput && localSettings.model === model
                            ? 'bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark border-2 border-brand dark:border-brand-dark' 
                            : 'bg-white dark:bg-[#1c1c1e] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:border-brand/50 dark:hover:border-brand-dark/50'
                        }`}
                      >
                        {model}
                      </button>
                    ))}
                  </div>

                  {showCustomModelInput && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <input
                        type="text"
                        value={localSettings.model}
                        onChange={(e) => {
                          const newModel = e.target.value;
                          if (selectedPreset.startsWith('custom_')) {
                            const newCustomProviders = customProviders.map(p => 
                              p.id === selectedPreset ? { ...p, defaultModel: newModel } : p
                            );
                            setLocalSettings({ ...localSettings, model: newModel, customProviders: newCustomProviders });
                          } else {
                            setLocalSettings({ ...localSettings, model: newModel });
                          }
                        }}
                        placeholder="gpt-3.5-turbo"
                        className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 dark:focus:ring-brand-dark/50 transition-shadow text-lg shadow-sm"
                      />
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ) : activeTab === 'media' ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-12 pb-10"
              >
                {/* Image Generation Section */}
                <div className="space-y-8">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400 rounded-xl">
                        <Image className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('image_generation_title', '图像生成')}</h3>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Image Provider Selector */}
                    <div className="space-y-3">
                      <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                        {t('provider_label', '供应商')}
                      </label>
                      <div className="relative">
                        <button
                          onClick={() => setIsImageDropdownOpen(!isImageDropdownOpen)}
                          className="w-full flex items-center justify-between px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] hover:border-brand/50 transition-all text-left group"
                        >
                          <span className="text-lg font-medium text-gray-900 dark:text-gray-100">
                            {allPresets.find(p => p.id === selectedImagePreset)?.name || t('custom_label', '自定义')}
                          </span>
                          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isImageDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {isImageDropdownOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setIsImageDropdownOpen(false)} />
                              <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                className="absolute left-0 right-0 top-full mt-2 z-20 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[24px] shadow-2xl overflow-hidden py-2"
                              >
                                {allPresets.map((preset) => (
                                  <button
                                    key={preset.id}
                                    onClick={() => {
                                      setSelectedImagePreset(preset.id);
                                      setIsImageDropdownOpen(false);
                                      setLocalSettings({
                                        ...localSettings,
                                        imageGen: {
                                          ...(localSettings.imageGen || { id: 'image', name: preset.name, apiKey: '', model: preset.defaultModel, apiUrl: preset.url }),
                                          apiUrl: preset.url,
                                          model: preset.defaultModel
                                        }
                                      });
                                    }}
                                    className={`w-full flex items-center px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
                                      selectedImagePreset === preset.id ? 'text-brand dark:text-brand-dark bg-brand/5 dark:bg-brand-dark/5' : 'text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    <span className="font-bold">{preset.name}</span>
                                  </button>
                                ))}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-black/20 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${!localSettings.imageGen?.apiUrl ? 'bg-brand animate-pulse' : 'bg-gray-400'}`} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('use_global_provider', '使用全局供应商设置')}</span>
                      </div>
                      <button
                        onClick={() => {
                          const currentlySynced = !localSettings.imageGen?.apiUrl;
                          setLocalSettings({
                            ...localSettings,
                            imageGen: { 
                              ...(localSettings.imageGen || { id: 'image', name: t('image_gen_label', 'Image Gen'), model: 'dall-e-3', apiUrl: '', apiKey: '' }),
                              apiUrl: currentlySynced ? (localSettings.apiUrl || 'https://api.openai.com/v1') : '',
                              apiKey: currentlySynced ? (localSettings.apiKey || '') : '',
                            }
                          });
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          (!localSettings.imageGen?.apiUrl) ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            (!localSettings.imageGen?.apiUrl) ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {localSettings.imageGen?.apiUrl && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 overflow-hidden pt-2"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">{t('api_url_label', 'API 地址')}</label>
                            <input
                              type="text"
                              value={localSettings.imageGen?.apiUrl || ''}
                              onChange={(e) => {
                                const newUrl = e.target.value;
                                setLocalSettings(prev => ({
                                  ...prev,
                                  imageGen: { 
                                    ...(prev.imageGen || { id: 'image', name: t('image_gen_label', 'Image Gen'), model: 'dall-e-3', apiKey: '' }), 
                                    apiUrl: newUrl 
                                  }
                                }));
                              }}
                              className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 transition-shadow text-lg shadow-sm"
                              placeholder="https://..."
                            />
                          </div>
                          <div className="space-y-3">
                            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">{t('api_key_label', 'API 密钥')}</label>
                            <input
                              type="password"
                              value={localSettings.imageGen?.apiKey || ''}
                              onChange={(e) => {
                                const newKey = e.target.value;
                                setLocalSettings(prev => ({
                                  ...prev,
                                  imageGen: { 
                                    ...(prev.imageGen || { id: 'image', name: 'Image Gen', model: 'dall-e-3', apiUrl: '' }), 
                                    apiKey: newKey 
                                  }
                                }));
                              }}
                              className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 transition-shadow text-lg shadow-sm"
                              placeholder="sk-..."
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between ml-1">
                        <label className="block text-base font-medium text-gray-700 dark:text-gray-300">图像模型</label>
                        <div className="flex items-center gap-2">
                          {isFetchingImageModels && <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />}
                          <button onClick={() => fetchMediaModels('image')} className="text-sm text-brand dark:text-brand-dark hover:underline">刷新</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(availableImageModels.length > 0 ? availableImageModels : ['dall-e-3', 'dall-e-2']).map(model => (
                          <button
                            key={model}
                            onClick={() => setLocalSettings({
                              ...localSettings,
                              imageGen: { ...(localSettings.imageGen || { id: 'image', name: 'Image Gen', apiUrl: '', apiKey: '', model: '' }), model }
                            })}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                              localSettings.imageGen?.model === model
                                ? 'bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark border-2 border-brand dark:border-brand-dark' 
                                : 'bg-white dark:bg-[#1c1c1e] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:border-brand/30 shadow-sm'
                            }`}
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-gray-800" />

                {/* Video Generation Section */}
                <div className="space-y-8">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-purple-500 dark:text-purple-400 rounded-xl">
                        <Video className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('video_generation', '视频生成')}</h3>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Video Provider Selector */}
                    <div className="space-y-3">
                      <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                        {t('provider_label', '供应商')}
                      </label>
                      <div className="relative">
                        <button
                          onClick={() => setIsVideoDropdownOpen(!isVideoDropdownOpen)}
                          className="w-full flex items-center justify-between px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] hover:border-brand/50 transition-all text-left group"
                        >
                          <span className="text-lg font-medium text-gray-900 dark:text-gray-100">
                            {allPresets.find(p => p.id === selectedVideoPreset)?.name || t('custom_label', '自定义')}
                          </span>
                          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isVideoDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {isVideoDropdownOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setIsVideoDropdownOpen(false)} />
                              <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                className="absolute left-0 right-0 top-full mt-2 z-20 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[24px] shadow-2xl overflow-hidden py-2"
                              >
                                {allPresets.map((preset) => (
                                  <button
                                    key={preset.id}
                                    onClick={() => {
                                      setSelectedVideoPreset(preset.id);
                                      setIsVideoDropdownOpen(false);
                                      setLocalSettings({
                                        ...localSettings,
                                        videoGen: {
                                          ...(localSettings.videoGen || { id: 'video', name: preset.name, apiKey: '', model: preset.defaultModel, apiUrl: preset.url }),
                                          apiUrl: preset.url,
                                          model: preset.defaultModel
                                        }
                                      });
                                    }}
                                    className={`w-full flex items-center px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${
                                      selectedVideoPreset === preset.id ? 'text-brand dark:text-brand-dark bg-brand/5 dark:bg-brand-dark/5' : 'text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    <span className="font-bold">{preset.name}</span>
                                  </button>
                                ))}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-black/20 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${!localSettings.videoGen?.apiUrl ? 'bg-brand animate-pulse' : 'bg-gray-400'}`} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('use_global_provider', '使用全局供应商设置')}</span>
                      </div>
                      <button
                        onClick={() => {
                          const currentlySynced = !localSettings.videoGen?.apiUrl;
                          setLocalSettings({
                            ...localSettings,
                            videoGen: { 
                              ...(localSettings.videoGen || { id: 'video', name: 'Video Gen', model: 'luma-gen-1', apiUrl: '', apiKey: '' }),
                              apiUrl: currentlySynced ? (localSettings.apiUrl || 'https://api.openai.com/v1') : '',
                              apiKey: currentlySynced ? (localSettings.apiKey || '') : '',
                            }
                          });
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          (!localSettings.videoGen?.apiUrl) ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            (!localSettings.videoGen?.apiUrl) ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {localSettings.videoGen?.apiUrl && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 overflow-hidden pt-2"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">{t('api_url_label', 'API 地址')}</label>
                            <input
                              type="text"
                              value={localSettings.videoGen?.apiUrl || ''}
                              onChange={(e) => {
                                const newUrl = e.target.value;
                                setLocalSettings(prev => ({
                                  ...prev,
                                  videoGen: { 
                                    ...(prev.videoGen || { id: 'video', name: 'Video Gen', model: 'luma-gen-1', apiKey: '' }), 
                                    apiUrl: newUrl 
                                  }
                                }));
                              }}
                              className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 transition-shadow text-lg shadow-sm"
                              placeholder="https://..."
                            />
                          </div>
                          <div className="space-y-3">
                            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">{t('api_key_label', 'API 密钥')}</label>
                            <input
                              type="password"
                              value={localSettings.videoGen?.apiKey || ''}
                              onChange={(e) => {
                                const newKey = e.target.value;
                                setLocalSettings(prev => ({
                                  ...prev,
                                  videoGen: { 
                                    ...(prev.videoGen || { id: 'video', name: 'Video Gen', model: 'luma-gen-1', apiUrl: '' }), 
                                    apiKey: newKey 
                                  }
                                }));
                              }}
                              className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 transition-shadow text-lg shadow-sm"
                              placeholder="sk-..."
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between ml-1">
                        <label className="block text-base font-medium text-gray-700 dark:text-gray-300">{t('video_model_label', '视频模型')}</label>
                        <div className="flex items-center gap-2">
                          {isFetchingVideoModels && <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />}
                          <button onClick={() => fetchMediaModels('video')} className="text-sm text-brand dark:text-brand-dark hover:underline">{t('refresh_list_button', '刷新')}</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(availableVideoModels.length > 0 ? availableVideoModels : ['luma-gen-1', 'sora-1']).map(model => (
                          <button
                            key={model}
                            onClick={() => setLocalSettings({
                              ...localSettings,
                              videoGen: { ...(localSettings.videoGen || { id: 'video', name: 'Video Gen', apiUrl: '', apiKey: '', model: '' }), model }
                            })}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                              localSettings.videoGen?.model === model
                                ? 'bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark border-2 border-brand dark:border-brand-dark' 
                                : 'bg-white dark:bg-[#1c1c1e] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:border-brand/30 shadow-sm'
                            }`}
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'parameters' ? (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="space-y-3">
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                    {t('system_prompt_label', '角色设定 (System Prompt)')}
                  </label>
                  <textarea
                    value={localSettings.systemPrompt || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, systemPrompt: e.target.value })}
                    placeholder={t('system_prompt_placeholder', '例如：你是一个有用的AI助手...')}
                    rows={4}
                    className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 dark:focus:ring-brand-dark/50 transition-shadow text-lg shadow-sm resize-none"
                  />
                </div>

                <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                      {t('auto_evolve_title', '自动进化 (Auto Evolve)')}
                    </span>
                    <span className="text-sm text-gray-500 mt-1">{t('auto_evolve_desc', '开启后，AI会自动根据每次回复更新角色设定以加入记忆')}</span>
                  </div>
                  <button
                    onClick={() => setLocalSettings({ ...localSettings, autoEvolve: !localSettings.autoEvolve })}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${localSettings.autoEvolve ? 'bg-brand dark:bg-brand-dark' : 'bg-gray-200 dark:bg-gray-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${localSettings.autoEvolve ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="space-y-4 p-5 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                        {t('auto_generate_title_label', '自动生成对话标题')}
                      </span>
                      <span className="text-sm text-gray-500 mt-1">
                        {t('auto_generate_title_desc', '开启后，新对话发送首条消息时将自动使用 AI 生成简短标题')}
                      </span>
                    </div>
                    <button
                      onClick={() => setLocalSettings({ ...localSettings, autoGenerateTitle: localSettings.autoGenerateTitle === false ? true : false })}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${localSettings.autoGenerateTitle !== false ? 'bg-brand dark:bg-brand-dark' : 'bg-gray-200 dark:bg-gray-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${localSettings.autoGenerateTitle !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {localSettings.autoGenerateTitle !== false && (
                    <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-800/80">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('auto_title_prompt_label', '自动命名 Prompt 模板')}
                        </label>
                        <button
                          onClick={() => setLocalSettings({ ...localSettings, autoTitlePrompt: undefined })}
                          className="text-xs text-brand dark:text-brand-dark hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {t('reset_default', '重置默认')}
                        </button>
                      </div>
                      <textarea
                        value={localSettings.autoTitlePrompt ?? '为接下来的用户消息生成一个极简标题（1-4个字）。不要使用引号、标点符号或对话语气，只返回标题文本。'}
                        onChange={(e) => setLocalSettings({ ...localSettings, autoTitlePrompt: e.target.value })}
                        placeholder={t('auto_title_prompt_placeholder', '请输入生成标题的 Prompt 指令...')}
                        rows={3}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/50 dark:focus:ring-brand-dark/50 transition-shadow text-sm shadow-xs resize-none"
                      />
                      <p className="text-xs text-gray-400">
                        {t('auto_title_hint', '系统会将用户的首条消息附在 Prompt 后面发送给 AI 以生成标题。')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                      {t('preload_pyodide_label', '预加载 Python 运行时 (Preload Pyodide)')}
                    </span>
                    <span className="text-sm text-gray-500 mt-1">{t('preload_pyodide_desc', '开启后，应用启动时将自动加载 Python 运行时，防止首次使用交互时出现卡顿')}</span>
                  </div>
                  <button
                    onClick={() => setLocalSettings({ ...localSettings, preloadPyodide: !localSettings.preloadPyodide })}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${localSettings.preloadPyodide ? 'bg-brand dark:bg-brand-dark' : 'bg-gray-200 dark:bg-gray-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${localSettings.preloadPyodide ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center ml-1">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                      {t('temperature_label', '随机性 (Temperature)')}
                    </label>
                    <span className="text-sm text-gray-500">{localSettings.temperature ?? 0.7}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localSettings.temperature ?? 0.7}
                    onChange={(e) => setLocalSettings({ ...localSettings, temperature: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-brand dark:accent-brand-dark"
                  />
                  <div className="flex justify-between text-xs text-gray-500 px-1">
                    <span>{t('precise_label', '精确')}</span>
                    <span>{t('creative_label', '创造性')}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                    {t('max_tokens_label', '最大回复长度 (Max Tokens)')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    value={localSettings.maxTokens ?? 2000}
                    onChange={(e) => setLocalSettings({ ...localSettings, maxTokens: parseInt(e.target.value, 10) || 2000 })}
                    className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 dark:focus:ring-brand-dark/50 transition-shadow text-lg shadow-sm"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center ml-1">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                      {t('hot_zone_rounds_label', '压缩保留热区轮数 (Hot Zone Rounds)')}
                    </label>
                    <span className="text-sm font-semibold text-brand dark:text-brand-dark">{localSettings.hotZoneRounds ?? 5} {t('hot_zone_rounds_unit', '轮')}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    value={localSettings.hotZoneRounds ?? 5}
                    onChange={(e) => setLocalSettings({ ...localSettings, hotZoneRounds: parseInt(e.target.value, 10) || 5 })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-brand dark:accent-brand-dark"
                  />
                  <div className="flex justify-between text-xs text-gray-500 px-1">
                    <span>{t('hot_zone_min', '保留最新 1 轮')}</span>
                    <span>{t('hot_zone_max', '保留最新 20 轮')}</span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                    {t('hot_zone_desc', '执行“压缩对话”时，最新的 N 轮对话作为热区完整保留，更早的冷区历史将通过 LLM 萃取为高密度结构化摘要。')}
                  </p>
                </div>

                <div className="space-y-4 p-5 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                      {t('compression_intensity_label', '上下文压缩强度')}
                    </span>
                    <span className="text-sm text-gray-500 mt-1">
                      {t('compression_intensity_desc', '选择压缩历史对话时的总结深度和详细程度')}
                    </span>
                  </div>
                  <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
                    {[
                      { id: 'low', label: t('low_intensity', '低强度'), desc: t('low_intensity_desc', '保留更多细节') },
                      { id: 'medium', label: t('medium_intensity', '均衡'), desc: t('medium_intensity_desc', '深度精简总结') },
                      { id: 'high', label: t('high_intensity', '高强度'), desc: t('high_intensity_desc', '极简核心萃取') },
                    ].map((level) => (
                      <button
                        key={level.id}
                        onClick={() => setLocalSettings({ ...localSettings, compressionIntensity: level.id as any })}
                        className={`flex-1 flex flex-col items-center justify-center py-2.5 px-2 rounded-xl transition-all ${
                          (localSettings.compressionIntensity || 'medium') === level.id
                            ? 'bg-white dark:bg-gray-700 text-brand dark:text-brand-dark shadow-sm border border-brand/20'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        <span className="text-sm font-bold">{level.label}</span>
                        <span className="text-[10px] opacity-70 mt-0.5">{level.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'tools' ? (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="bg-brand/5 dark:bg-brand-dark/10 p-6 rounded-[24px] border border-brand/10 dark:border-brand-dark/10">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-brand dark:bg-brand-dark rounded-2xl text-white shadow-lg shadow-brand/20 dark:shadow-brand-dark/20">
                      <Wrench className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-brand dark:text-brand-dark">{t('tools_title', '工具扩展功能')}</h3>
                      <p className="text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                        {t('tools_desc', '启用强大的工具扩展，让 AI 能够访问实时信息、处理文件或执行复杂计算。')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 ml-1">
                    {t('tavily_api_label', 'Tavily 搜索 API 密钥 (用于联网搜索工具)')}
                  </label>
                  <input
                    type="password"
                    value={localSettings.searchApiKey || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, searchApiKey: e.target.value })}
                    placeholder="tvly-..."
                    className="w-full px-5 py-4 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-[20px] focus:outline-none focus:ring-2 focus:ring-brand/50 dark:focus:ring-brand-dark/50 transition-shadow text-lg shadow-sm"
                  />
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm text-gray-500">
                      {t('get_api_key', '获取密钥')}: <a href="https://tavily.com/" target="_blank" rel="noopener noreferrer" className="text-brand dark:text-brand-dark hover:underline">tavily.com</a>
                    </p>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-brand/50 dark:text-brand-dark/50">{t('recommended', '推荐')}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                      {t('mcp_server_config', 'MCP 服务器配置 (Model Context Protocol)')}
                    </label>
                    <button
                      onClick={() => {
                        const newMcpServers = [...(localSettings.mcpServers || [])];
                        newMcpServers.push({ id: `mcp_${Date.now()}`, name: t('new_server_name', '新服务器'), url: '' });
                        setLocalSettings({ ...localSettings, mcpServers: newMcpServers });
                      }}
                      className="text-xs font-bold text-brand dark:text-brand-dark hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      {t('add_mcp_server', '添加服务器')}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(localSettings.mcpServers || []).map((server, index) => (
                      <div key={server.id} className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-[20px] border border-gray-100 dark:border-gray-800/60 space-y-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            value={server.name}
                            onChange={(e) => {
                              const newMcpServers = [...(localSettings.mcpServers || [])];
                              newMcpServers[index].name = e.target.value;
                              setLocalSettings({ ...localSettings, mcpServers: newMcpServers });
                            }}
                            placeholder={t('mcp_server_name', '服务器名称')}
                            className="flex-1 bg-transparent border-none focus:ring-0 p-0 text-sm font-bold text-gray-900 dark:text-gray-100"
                          />
                          <button
                            onClick={() => {
                              const newMcpServers = (localSettings.mcpServers || []).filter(s => s.id !== server.id);
                              setLocalSettings({ ...localSettings, mcpServers: newMcpServers });
                            }}
                            className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={server.url}
                          onChange={(e) => {
                            const newMcpServers = [...(localSettings.mcpServers || [])];
                            newMcpServers[index].url = e.target.value;
                            setLocalSettings({ ...localSettings, mcpServers: newMcpServers });
                          }}
                          placeholder={t('mcp_server_url_placeholder', '服务器 URL (例如: http://localhost:3001)')}
                          className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-brand/50 dark:focus:ring-brand-dark/50"
                        />
                      </div>
                    ))}
                    {(localSettings.mcpServers || []).length === 0 && (
                      <div className="text-center py-4 text-xs text-gray-400 italic">
                        {t('no_mcp_servers_hint', '尚未添加任何 MCP 服务器')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-5 border border-gray-100 dark:border-gray-800 rounded-[20px] space-y-4">
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">{t('built_in_tools', '内置工具列表')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { name: t('tool_web_search', '联网搜索'), desc: t('tool_web_search_desc', '基于 Tavily 的实时互联网访问') },
                      { name: t('tool_code_exec', '代码执行'), desc: t('tool_code_exec_desc', '执行 JS 代码并获取结果输出') },
                      { name: t('tool_file_proc', '文件处理'), desc: t('tool_file_proc_desc', '创建和读取虚拟文件系统') },
                      { name: t('tool_unit_conv', '单位转换'), desc: t('tool_unit_conv_desc', '长度、重量、温度快速转换') },
                      { name: t('tool_password_gen', '安全密码'), desc: t('tool_password_gen_desc', '生成高强度随机密码') },
                      { name: t('tool_color_tools', '颜色工具'), desc: t('tool_color_tools_desc', 'Hex/RGB 互转及随机取色') },
                      { name: t('tool_base64', 'Base64'), desc: t('tool_base64_desc', '文本编码与解码处理') }
                    ].map(tool => (
                      <div key={tool.name} className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800/60">
                        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{tool.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{tool.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'about' ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-10 py-4"
              >
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="relative group">
                    <img 
                      src="/logo.png"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                      alt="NeaiChat Logo"
                      className="w-32 h-32 rounded-[32px] shadow-2xl relative z-10 hover:scale-105 transition-transform duration-500 object-cover border border-gray-200 dark:border-gray-800"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">NeaiChat</h2>
                    <p 
                      className="text-gray-500 font-medium cursor-default select-none hover:text-brand transition-colors"
                      onClick={handleVersionClick}
                    >
                      {t('version', '版本')} 2.1.0 (2026.08.09)
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <a 
                      href="https://github.com/NewCity-Soft/NeaiChat" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg"
                    >
                      <Github className="w-5 h-5" />
                      {t('github_repo', 'GitHub 开源仓库')}
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setActiveTab('legal')}
                    className="p-6 bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-gray-800 rounded-[32px] text-left hover:border-brand transition-all group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-brand/10 dark:bg-brand-dark/20 flex items-center justify-center text-brand dark:text-brand-dark mb-4 group-hover:scale-110 transition-transform">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{t('export_compliance_title', '导出与合规')}</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">{t('export_compliance_desc', '配置内容导出许可、显式水印标识及查阅相关法律协议与政策。')}</p>
                  </button>

                  <button
                    onClick={() => setActiveTab('backup')}
                    className="p-6 bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-gray-800 rounded-[32px] text-left hover:border-brand transition-all group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-brand/10 dark:bg-brand-dark/20 flex items-center justify-center text-brand dark:text-brand-dark mb-4 group-hover:scale-110 transition-transform">
                      <Download className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{t('backup_restore_title', '备份与恢复')}</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">{t('backup_restore_desc_alt', '导出或导入您的完整应用配置，包括 API 密钥、模型列表与界面偏好。')}</p>
                  </button>
                </div>


              </motion.div>
            ) : activeTab === 'legal' ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('export_compliance_title', '导出与合规')}</h3>
                    <p className="text-sm text-gray-500 mt-1">{t('legal_desc', '配置全局内容导出许可、生成标识与相关法律协议。')}</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('about')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand dark:text-brand-dark bg-brand/10 dark:bg-brand-dark/20 rounded-xl hover:bg-brand/20 transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {t('return_to_about', '返回关于')}
                  </button>
                </div>

                {/* Export Mode Selection */}
                <div className="bg-white dark:bg-[#1c1c1e] p-6 rounded-3xl border border-gray-200/80 dark:border-gray-800 space-y-4">
                  <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-brand" />
                    {t('export_license_watermark', '导出许可与水印设置')}
                  </h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {t('export_license_hint', '您可以随时重新配置导出许可与水印标注模式。若选择“不同意并关闭导出功能”，全应用界面将自动隐藏所有下载与导出按钮。')}
                  </p>

                  <div className="space-y-3 pt-2">
                    <label className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                      (localSettings.exportMode || 'agree_no_watermark') === 'agree_no_watermark'
                        ? 'bg-brand/5 border-brand dark:border-brand-dark text-gray-900 dark:text-white'
                        : 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="exportModeSettings"
                        checked={(localSettings.exportMode || 'agree_no_watermark') === 'agree_no_watermark'}
                        onChange={() => setLocalSettings({ ...localSettings, exportMode: 'agree_no_watermark' })}
                        className="mt-1 w-4 h-4 text-brand accent-brand focus:ring-brand cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-sm block">{t('export_agree_no_wm', '开启导出：同意并去除显式水印')}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5">
                          {t('export_agree_no_wm_desc', '允许导出对话与文件。去除肉眼可见的【AI生成】标注，文件内部仍保留合规不可见溯源元数据。')}
                        </span>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                      localSettings.exportMode === 'agree_with_watermark'
                        ? 'bg-brand/5 border-brand dark:border-brand-dark text-gray-900 dark:text-white'
                        : 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="exportModeSettings"
                        checked={localSettings.exportMode === 'agree_with_watermark'}
                        onChange={() => setLocalSettings({ ...localSettings, exportMode: 'agree_with_watermark' })}
                        className="mt-1 w-4 h-4 text-brand accent-brand focus:ring-brand cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-sm block">{t('export_agree_with_wm', '开启导出：同意并保留显式水印')}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5">
                          {t('export_agree_with_wm_desc', '允许导出对话与文件。在生成的图片或长图中增加显式【AI生成】合规性半透明水印标注。')}
                        </span>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                      localSettings.exportMode === 'disabled'
                        ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900/60 text-gray-900 dark:text-white'
                        : 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="exportModeSettings"
                        checked={localSettings.exportMode === 'disabled'}
                        onChange={() => setLocalSettings({ ...localSettings, exportMode: 'disabled' })}
                        className="mt-1 w-4 h-4 text-rose-500 accent-rose-500 focus:ring-rose-500 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-sm block text-rose-600 dark:text-rose-400">{t('export_disagree', '关闭导出：不同意并禁用相关功能')}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5">
                          {t('export_disagree_desc', '隐藏全站所有对话下载、截图与文件导出按钮，以严格控制内容流通范围。')}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Legal Documents Section */}
                <div className="bg-white dark:bg-[#1c1c1e] p-6 rounded-3xl border border-gray-200/80 dark:border-gray-800 space-y-4">
                  <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-brand" />
                    {t('legal_agreement_title', '法律协议与政策')}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {t('legal_desc_detail', '查阅与本软件使用相关的第三方隐私政策、用户服务协议及导出功能使用须知。')}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <a
                      href={PRIVACY_POLICY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/80 border border-gray-200/80 dark:border-gray-800 rounded-2xl flex items-center justify-between transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-brand" />
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{t('privacy_policy_label', '隐私政策')}</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand transition-colors" />
                    </a>

                    <button
                      onClick={() => setViewingLegalDoc('user_agreement')}
                      className="p-4 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/80 border border-gray-200/80 dark:border-gray-800 rounded-2xl flex items-center justify-between transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-brand" />
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{t('terms_of_service_label', '用户服务协议')}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand transition-colors" />
                    </button>

                    <button
                      onClick={() => setViewingLegalDoc('export_notice')}
                      className="p-4 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/80 border border-gray-200/80 dark:border-gray-800 rounded-2xl flex items-center justify-between transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <Download className="w-4 h-4 text-brand" />
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{t('export_usage_notice', '导出使用须知')}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand transition-colors" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : null}

            </div>
          </div>
        </div>
      </motion.div>

      <LegalNoticeModal
        isOpen={viewingLegalDoc !== null}
        onClose={() => setViewingLegalDoc(null)}
        type={viewingLegalDoc || 'user_agreement'}
      />
    </div>
  </AnimatePresence>
);
}
