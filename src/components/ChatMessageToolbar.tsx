import { useState } from 'react';
import { 
  Copy, 
  Check, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  GitFork, 
  Pin, 
  PinOff, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  Pencil
} from 'lucide-react';
import { ToolbarItemConfig } from '../types';
import { DEFAULT_BUBBLE_TOOLS, sanitizeToolbarConfig } from '../utils/toolbar-defaults';
import { useTranslation } from '../i18n';

export interface ChatMessageToolbarProps {
  messageId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  isStreaming?: boolean;
  isPinned?: boolean;
  speakingId?: string | null;
  copiedId?: string | null;
  currentVersionIndex?: number;
  totalVersions?: number;
  bubbleToolsConfig?: ToolbarItemConfig[];
  onCopy?: (id: string, text: string) => void;
  onRegenerate?: (id: string) => void;
  onSpeak?: (id: string, text: string) => void;
  onBranch?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onSwitchVersion?: (id: string, newIndex: number) => void;
  className?: string;
}

export const ChatMessageToolbar = ({
  messageId,
  role,
  content,
  isStreaming = false,
  isPinned = false,
  speakingId,
  copiedId,
  currentVersionIndex = 0,
  totalVersions = 1,
  bubbleToolsConfig,
  onCopy,
  onRegenerate,
  onSpeak,
  onBranch,
  onTogglePin,
  onDelete,
  onEdit,
  onSwitchVersion,
  className = ''
}: ChatMessageToolbarProps) => {
  const { t } = useTranslation();
  const [internalCopied, setInternalCopied] = useState(false);

  if (!content) return null;

  const handleLocalCopy = () => {
    navigator.clipboard.writeText(content);
    setInternalCopied(true);
    setTimeout(() => setInternalCopied(false), 2000);
    if (onCopy) {
      onCopy(messageId, content);
    }
  };

  const isCopied = copiedId ? copiedId === messageId : internalCopied;
  const isSpeaking = speakingId === messageId;
  const hasVersions = totalVersions > 1;

  const tools = sanitizeToolbarConfig(bubbleToolsConfig, DEFAULT_BUBBLE_TOOLS).filter(t => t.visible);

  return (
    <div className={`flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ${role === 'user' ? 'pr-2' : 'pl-2'} ${className}`}>
      {tools.map((tool) => {
        if (tool.id === 'version_switch') {
          if (!hasVersions) return null;
          return (
            <div key="version_switch" className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5 mr-1 border border-gray-200 dark:border-gray-700 shadow-2xs">
              <button
                disabled={currentVersionIndex === 0}
                onClick={() => onSwitchVersion?.(messageId, currentVersionIndex - 1)}
                className="p-0.5 disabled:opacity-30 text-gray-500 hover:text-brand transition-colors cursor-pointer"
                title={t('prev_version', '上一版本')}
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[10px] font-medium text-gray-500 min-w-[24px] text-center">
                {currentVersionIndex + 1} / {totalVersions}
              </span>
              <button
                disabled={currentVersionIndex === totalVersions - 1}
                onClick={() => onSwitchVersion?.(messageId, currentVersionIndex + 1)}
                className="p-0.5 disabled:opacity-30 text-gray-500 hover:text-brand transition-colors cursor-pointer"
                title={t('next_version', '下一版本')}
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          );
        }

        if (tool.id === 'edit') {
          if (role !== 'user' || !onEdit) return null;
          return (
            <button
              key="edit"
              onClick={() => onEdit(messageId)}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-brand dark:text-gray-500 dark:hover:text-brand-dark cursor-pointer"
              title={t('edit_message', '编辑消息')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          );
        }

        if (tool.id === 'regenerate') {
          if (role !== 'assistant' || !onRegenerate) return null;
          return (
            <button
              key="regenerate"
              onClick={() => onRegenerate(messageId)}
              disabled={isStreaming}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-brand dark:text-gray-500 dark:hover:text-brand-dark disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title={t('regenerate', '重新生成')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          );
        }

        if (tool.id === 'speak') {
          if (!onSpeak) return null;
          return (
            <button
              key="speak"
              onClick={() => onSpeak(messageId, content)}
              className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                isSpeaking ? 'text-brand dark:text-brand-dark' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
              }`}
              title={isSpeaking ? t('stop_speech', '停止播放') : t('read_aloud', '语音朗读')}
            >
              {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          );
        }

        if (tool.id === 'branch') {
          if (!onBranch) return null;
          return (
            <button
              key="branch"
              onClick={() => onBranch(messageId)}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-brand dark:text-gray-500 dark:hover:text-brand-dark cursor-pointer"
              title={t('branch_chat_title', '从此处派生新对话（分支）')}
            >
              <GitFork className="w-3.5 h-3.5" />
            </button>
          );
        }

        if (tool.id === 'pin') {
          if (!onTogglePin) return null;
          return (
            <button
              key="pin"
              onClick={() => onTogglePin(messageId)}
              className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                isPinned ? 'text-brand dark:text-brand-dark' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
              }`}
              title={isPinned ? t('unpin_message', '取消固定') : t('pin_message', '固定消息')}
            >
              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          );
        }

        if (tool.id === 'copy') {
          return (
            <button
              key="copy"
              onClick={handleLocalCopy}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 cursor-pointer"
              title={t('copy_content', '复制内容')}
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          );
        }

        if (tool.id === 'delete') {
          if (!onDelete) return null;
          return (
            <button
              key="delete"
              onClick={() => onDelete(messageId)}
              className="p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 cursor-pointer"
              title={t('delete_message', '删除消息')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          );
        }

        return null;
      })}
    </div>
  );
};
