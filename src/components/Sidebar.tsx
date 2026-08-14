import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Plus, Search, Settings, Trash2, X, Zap, TrendingUp, HardDrive, ShieldCheck, Code2, ChevronDown, Edit3 } from 'lucide-react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { Chat, ChatMode } from '../types';
import { useTranslation } from '../i18n';

interface SidebarProps {
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: (mode?: ChatMode) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string) => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onOpenUsage: () => void;
  onOpenPromptLibrary: () => void;
  onOpenVFS?: () => void;
  onOpenWatermarkModal?: () => void;
  onCloseSidebar?: () => void;
  showStudio?: boolean;
  onToggleStudio?: () => void;
}

interface ChatListItemProps {
  chat: Chat;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: () => void;
}

function ChatListItem({ chat, isActive, onSelect, onDelete, onRename }: ChatListItemProps) {
  const x = useMotionValue(0);
  const renameOpacity = useTransform(x, [0, 80], [0, 1]);
  const deleteOpacity = useTransform(x, [-80, 0], [1, 0]);
  const renameScale = useTransform(x, [0, 80], [0.8, 1]);
  const deleteScale = useTransform(x, [-80, 0], [1, 0.8]);

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.x > 80) {
      onRename();
    } else if (info.offset.x < -80) {
      onDelete();
    }
  };

  return (
    <div className="relative group overflow-hidden rounded-[12px]">
      {/* Background Actions */}
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <motion.div 
          style={{ opacity: renameOpacity, scale: renameScale }}
          className="flex items-center gap-2 text-brand dark:text-brand-dark"
        >
          <Edit3 className="w-4 h-4" />
          <span className="text-[10px] font-bold">重命名</span>
        </motion.div>
        <motion.div 
          style={{ opacity: deleteOpacity, scale: deleteScale }}
          className="flex items-center gap-2 text-red-500"
        >
          <span className="text-[10px] font-bold">删除</span>
          <Trash2 className="w-4 h-4" />
        </motion.div>
      </div>

      {/* Foreground Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -100, right: 100 }}
        dragElastic={0.2}
        style={{ x }}
        onDragEnd={handleDragEnd}
        onClick={onSelect}
        className={`relative z-10 flex items-center justify-between p-3 rounded-[12px] cursor-pointer transition-all
          ${
            isActive
              ? 'bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark'
              : 'bg-bg-secondary dark:bg-bg-secondary-dark hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          {chat.mode === 'coding' ? (
            <Code2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <MessageSquare className="w-4 h-4 shrink-0" />
          )}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{chat.title}</span>
              {chat.mode === 'coding' && (
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1 py-0.1 rounded font-mono shrink-0">
                  编程
                </span>
              )}
            </div>
            {chat.usage && (
              <span className="text-[10px] opacity-60">
                {chat.usage.totalTokens.toLocaleString()} Tokens
              </span>
            )}
          </div>
        </div>
        
        {/* Desktop Quick Actions (visible on hover) */}
        <div className="hidden lg:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            className="p-1.5 text-gray-400 hover:text-brand dark:hover:text-brand-dark rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function Sidebar({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onClearAll,
  onOpenSettings,
  onOpenUsage,
  onOpenPromptLibrary,
  onOpenVFS,
  onOpenWatermarkModal,
  showStudio,
  onToggleStudio,
}: SidebarProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChatMenu, setShowNewChatMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowNewChatMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredChats = chats.filter((chat) => {
    // Hide coding chats if studio mode is hidden
    if (!showStudio && chat.mode === 'coding') return false;

    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    const matchesTitle = chat.title.toLowerCase().includes(query);
    const matchesMessages = chat.messages.some((m) => 
      m.content.toLowerCase().includes(query)
    );
    
    return matchesTitle || matchesMessages;
  });

  const handleSelectNewChatMode = (mode: ChatMode) => {
    setShowNewChatMenu(false);
    onNewChat(mode);
  };

  return (
    <div className="flex flex-col h-full w-full bg-bg-secondary dark:bg-bg-secondary-dark backdrop-blur-2xl border-r border-gray-200/50 dark:border-gray-800/50">
      <div className="p-4 space-y-3">
        <div className="flex gap-2 relative" ref={menuRef}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (showStudio) {
                setShowNewChatMenu(prev => !prev);
              } else {
                onNewChat('standard');
              }
            }}
            className="flex-1 flex items-center justify-between px-5 py-3 bg-brand dark:bg-brand-dark text-white rounded-full font-medium hover:opacity-90 transition-all shadow-sm min-h-[44px] cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5 shrink-0" />
              <span className="text-sm font-semibold tracking-wide">{t('new_chat', '新对话')}</span>
            </div>
            {showStudio && (
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showNewChatMenu ? 'rotate-180' : ''}`} />
            )}
          </motion.button>

          <AnimatePresence>
            {showNewChatMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute top-full left-0 right-0 mt-2 z-50 bg-white/95 dark:bg-[#202024]/95 backdrop-blur-2xl rounded-[24px] shadow-2xl border border-gray-200/80 dark:border-gray-700/80 p-2 space-y-1"
              >
                <button
                  onClick={() => handleSelectNewChatMode('standard')}
                  className="w-full flex items-start gap-3 p-3 rounded-[16px] text-left hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all group cursor-pointer"
                >
                  <div className="p-2.5 rounded-xl bg-brand/10 text-brand dark:text-brand-dark transition-colors shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('standard_mode', '普通对话')}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{t('standard_mode_desc', '通用大模型智能问答、文档分析与常规服务')}</div>
                  </div>
                </button>

                <button
                  onClick={() => handleSelectNewChatMode('coding')}
                  className="w-full flex items-start gap-3 p-3 rounded-[16px] text-left hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all group cursor-pointer"
                >
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors shrink-0">
                    <Code2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('coding_mode', '编程模式')}</span>
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded-full font-mono font-bold">
                        SPA Studio
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{t('coding_mode_desc', '独立 VFS、HTML/JS/CSS 与图表数据应用')}</div>
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {chats.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClearAll}
              title={t('clear_all_chats', '清除所有对话')}
              className="p-3 text-gray-400 hover:text-red-500 bg-white/80 dark:bg-[#1c1c1e]/80 border border-gray-200/80 dark:border-gray-800/80 rounded-full transition-all hover:border-red-200 dark:hover:border-red-900/50 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer shrink-0"
            >
              <Trash2 className="w-5 h-5" />
            </motion.button>
          )}
        </div>

        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-brand transition-colors" />
          <input
            type="text"
            placeholder={t('search_placeholder', '搜索对话或应用...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 bg-white/80 dark:bg-[#1c1c1e]/80 border border-gray-200/80 dark:border-gray-800/80 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand-dark/30 focus:border-brand dark:focus:border-brand-dark transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        <AnimatePresence mode="popLayout">
          {filteredChats.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-10 px-4 text-center"
            >
              <Search className="w-8 h-8 text-gray-300 dark:text-gray-700 mb-2" />
              <p className="text-xs text-gray-400">{t('no_chats', '没有找到匹配的对话')}</p>
            </motion.div>
          ) : (
            filteredChats.map((chat) => (
              <motion.div
                key={chat.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <ChatListItem 
                  chat={chat}
                  isActive={currentChatId === chat.id}
                  onSelect={() => onSelectChat(chat.id)}
                  onDelete={() => onDeleteChat(chat.id)}
                  onRename={() => onRenameChat(chat.id)}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 border-t border-gray-200/50 dark:border-gray-800/50 space-y-1">
        <button 
          onClick={onOpenUsage}
          className="w-full px-3 py-2.5 mb-2 bg-gray-100 dark:bg-[#1c1c1e] rounded-xl flex items-center gap-3 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer text-left border border-transparent hover:border-brand/20 dark:hover:border-brand-dark/20 group"
        >
          <div className="p-2 rounded-lg bg-white dark:bg-[#2c2c2e] text-brand dark:text-brand-dark shadow-sm group-hover:scale-110 transition-transform">
            <Zap className="w-4 h-4" />
          </div>
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{t('history_usage', '累计消耗')}</span>
              <TrendingUp className="w-3 h-3 text-gray-300 group-hover:text-brand transition-colors" />
            </div>
            <span className="text-sm font-mono font-bold text-gray-700 dark:text-gray-200">
              {chats.reduce((acc, chat) => acc + (chat.usage?.totalTokens || 0), 0).toLocaleString()} <span className="text-[10px] text-gray-400 font-sans font-medium">Tokens</span>
            </span>
          </div>
        </button>
        {onOpenVFS && showStudio && (
          <button
            onClick={onOpenVFS}
            className="flex items-center gap-3 w-full p-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-[12px] transition-all cursor-pointer"
          >
            <HardDrive className="w-5 h-5 text-brand dark:text-brand-dark" />
            <span className="font-medium text-sm">{t('vfs_explorer', '全局虚拟文件系统')}</span>
          </button>
        )}
        {onOpenWatermarkModal && (
          <button
            onClick={onOpenWatermarkModal}
            className="flex items-center justify-between w-full p-3 text-gray-700 dark:text-gray-300 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-[12px] transition-all cursor-pointer group border border-transparent hover:border-emerald-500/20"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
              <span className="font-medium text-sm">{t('watermark', '显式标识合规中心')}</span>
            </div>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded-full">
              {t('compliance', '合规')}
            </span>
          </button>
        )}
        <button
          onClick={onOpenPromptLibrary}
          className="flex items-center gap-3 w-full p-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-[12px] transition-all cursor-pointer"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="font-medium text-sm">{t('prompt_library', '提示词库')}</span>
        </button>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-3 w-full p-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-[12px] transition-all cursor-pointer"
        >
          <Settings className="w-5 h-5" />
          <span className="font-medium text-sm">{t('settings', '设置')}</span>
        </button>

        <div className="flex justify-center pt-2">
          <span 
            onClick={handleVersionClick}
            className="text-[10px] text-gray-300 dark:text-gray-700 select-none cursor-default hover:text-gray-400 transition-colors"
          >
            v2.1.0
          </span>
        </div>
      </div>
    </div>
  );
}
