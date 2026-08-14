import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { motion } from 'motion/react';
import { 
  Check, 
  Copy, 
  Wrench, 
  ChevronUp, 
  ChevronDown, 
  AlertTriangle 
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import { Message, Attachment, ToolbarItemConfig } from '../types';
import { FileCard } from './FileCard';
import { CodeBlock } from './CodeBlock';
import { ThoughtBlock, parseThought } from './ThoughtBlock';
import { ChatMessageToolbar } from './ChatMessageToolbar';
import { Mermaid } from './MermaidRenderer';
import { useTranslation } from '../i18n';

export interface ChatMessageBubbleProps {
  message: Message;
  messages?: Message[];
  messageIndex?: number;
  isStreaming?: boolean;
  isLastMessage?: boolean;
  theme?: 'light' | 'dark';
  // Coding Mode callback: when provided, code blocks render with "Apply to VFS"
  onApplyCodeToVFS?: (targetFile: string, content: string) => void;
  // Code runner callbacks
  onRunCode?: (code: string, language: string) => void;
  onFullScreenCode?: (code: string, language: string) => void;
  onEnlargeImage?: (url: string) => void;
  onReferenceAttachment?: (attachment: Attachment) => void;
  // Toolbar props & callbacks
  toolbarConfig?: ToolbarItemConfig[];
  copiedId?: string | null;
  speakingId?: string | null;
  onCopyMessage?: (id: string, text: string) => void;
  onRegenerateMessage?: (id: string) => void;
  onSpeakMessage?: (id: string, text: string) => void;
  onBranchMessage?: (id: string) => void;
  onTogglePinMessage?: (id: string) => void;
  onDeleteMessage?: (id: string) => void;
  onEditMessage?: (id: string, content: string) => void;
  onSwitchVersionMessage?: (id: string, newIndex: number) => void;
}

// Studio Code Block for VFS Sync
function StudioCodeBlock({
  language,
  code,
  onApplyToVFS,
}: {
  language: string;
  code: string;
  onApplyToVFS: (targetFile: string, content: string) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  let targetFile = '';
  const firstLine = code.split('\n')[0]?.trim() || '';
  if (firstLine.startsWith('/') || firstLine.endsWith('.html') || firstLine.endsWith('.js') || firstLine.endsWith('.css') || firstLine.endsWith('.json')) {
    targetFile = firstLine.startsWith('/') ? firstLine : '/' + firstLine;
  } else if (language.includes('/')) {
    targetFile = language.startsWith('/') ? language : '/' + language;
  } else {
    const cleanLang = language.toLowerCase();
    if (cleanLang === 'css') targetFile = '/style.css';
    else if (cleanLang === 'js' || cleanLang === 'javascript') targetFile = '/app.js';
    else if (cleanLang === 'html') targetFile = '/index.html';
    else if (cleanLang === 'json') targetFile = '/data.json';
    else targetFile = '/index.html';
  }

  const cleanLang = language.replace(/^\/.*$/, '').trim() || (targetFile.endsWith('.css') ? 'css' : targetFile.endsWith('.js') ? 'javascript' : 'html');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    onApplyToVFS(targetFile, code);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  return (
    <div className="rounded-[14px] overflow-hidden my-3 border border-gray-200 dark:border-gray-800 shadow-xs relative bg-[#1e1e22] text-gray-100 not-prose">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#25252a] text-xs border-b border-gray-800 font-sans">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-800 px-2 py-0.5 rounded-md">
            {cleanLang}
          </span>
          <span className="font-mono text-[11px] text-brand dark:text-brand-dark font-semibold bg-brand/10 dark:bg-brand-dark/20 px-2.5 py-0.5 rounded-full">
            {targetFile}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1 hover:text-white hover:bg-gray-700 rounded-md transition-colors flex items-center gap-1 text-gray-400 text-[11px] cursor-pointer"
            title={t('copy_code', '复制代码')}
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? t('copied', '已复制') : t('copy', '复制')}</span>
          </button>

          <button
            onClick={handleApply}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
              applied
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-brand dark:bg-brand-dark hover:opacity-90 text-white shadow-xs'
            }`}
            title={t('sync_vfs_title', '一键同步至虚拟文件系统')}
          >
            <Check className="w-3 h-3" />
            <span>{applied ? t('vfs_synced', '已同步 VFS') : t('apply_vfs', '应用至 VFS')}</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto text-[12px] font-mono leading-relaxed">
        <SyntaxHighlighter
          language={cleanLang || 'javascript'}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '12px 16px',
            background: 'transparent',
            fontSize: '12px',
            lineHeight: '1.5',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

export const ChatMessageBubble = ({
  message: msg,
  messages,
  messageIndex,
  isStreaming = false,
  isLastMessage = false,
  theme = 'light',
  onApplyCodeToVFS,
  onRunCode,
  onFullScreenCode,
  onEnlargeImage,
  onReferenceAttachment,
  toolbarConfig,
  copiedId,
  speakingId,
  onCopyMessage,
  onRegenerateMessage,
  onSpeakMessage,
  onBranchMessage,
  onTogglePinMessage,
  onDeleteMessage,
  onEditMessage,
  onSwitchVersionMessage,
}: ChatMessageBubbleProps) => {
  const { t } = useTranslation();
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [editingContent, setEditingContent] = useState('');

  const toggleExpandedToolCall = (id: string) => {
    setExpandedToolCalls((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Extract display content & versions
  const versions = msg.versions && msg.versions.length > 0 ? msg.versions : [msg.content];
  const currentVersionIndex = msg.currentVersionIndex !== undefined ? msg.currentVersionIndex : versions.length - 1;
  const rawVersion = versions[currentVersionIndex] || msg.content;
  
  const isMsgError = msg.isError || (typeof rawVersion !== 'string' && rawVersion?.isError);
  const errorText = (typeof rawVersion !== 'string' && rawVersion?.error) || msg.error;
  
  const displayContent: string = isMsgError && errorText 
    ? errorText 
    : (typeof rawVersion === 'string' ? rawVersion : (rawVersion?.content || msg.content || ''));

  const isFirstAssistantInTurn = msg.role === 'assistant' && (messageIndex === undefined || messageIndex === 0 || messages?.[messageIndex - 1]?.role === 'user');

  if ((msg.role as string) === 'tool' || (msg.role === 'assistant' && !isFirstAssistantInTurn)) {
    return null;
  }

  const handleSaveEdit = () => {
    if (editingContent.trim() && onEditMessage) {
      onEditMessage(msg.id, editingContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const getTurnBlocks = () => {
    const blocks: any[] = [];
    const toolResults: Record<string, string> = {};

    const addMessageBlocks = (m: any, isFirst: boolean) => {
      const hasVersions = m.versions && m.versions.length > 1;
      const cvIndex = m.currentVersionIndex ?? (hasVersions ? m.versions.length - 1 : 0);
      const messageBlocks = (isFirst && hasVersions && m.versions) 
        ? m.versions[cvIndex].blocks 
        : m.blocks;
      const content = (isFirst && hasVersions && m.versions) 
        ? (typeof m.versions[cvIndex] === 'string' ? m.versions[cvIndex] : m.versions[cvIndex].content)
        : m.content;
      const tool_calls = (isFirst && hasVersions && m.versions) 
        ? m.versions[cvIndex].tool_calls 
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

    if (messages && messageIndex !== undefined) {
      addMessageBlocks(msg, true);
      for (let i = messageIndex + 1; i < messages.length; i++) {
        const m = messages[i];
        if (m.role === 'user') break;
        if (m.role === 'tool') {
          toolResults[m.tool_call_id || ''] = m.content;
        } else if (m.role === 'assistant') {
          addMessageBlocks(m, false);
        }
      }
    } else {
      addMessageBlocks(msg, true);
    }

    return { blocks, toolResults };
  };

  const { blocks, toolResults } = getTurnBlocks();

  // User Message Bubble
  if (msg.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        id={`msg-${msg.id}`}
        className="flex flex-col items-end gap-1.5 group w-full my-1.5"
      >
        <div className="px-4 py-3 rounded-[22px] rounded-tr-sm bg-brand dark:bg-brand-dark text-white shadow-xs max-w-[88%] text-xs sm:text-sm leading-relaxed font-medium overflow-hidden">
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {msg.attachments.map(at => (
                <FileCard 
                  key={at.id} 
                  at={at} 
                  isUser 
                  onEnlarge={(url) => onEnlargeImage?.(url)}
                />
              ))}
            </div>
          )}
          <div 
            className="whitespace-pre-wrap break-words [word-break:break-word]"
            onDoubleClick={() => {
              setIsEditing(true);
              setEditingContent(displayContent);
            }}
          >
            {isEditing ? (
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

        {/* Toolbar */}
        <ChatMessageToolbar
          messageId={msg.id}
          role="user"
          content={displayContent}
          isPinned={msg.isPinned}
          copiedId={copiedId}
          bubbleToolsConfig={toolbarConfig}
          onCopy={onCopyMessage}
          onTogglePin={onTogglePinMessage}
          onDelete={onDeleteMessage}
        />
      </motion.div>
    );
  }

  // Assistant Message Bubble
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      id={`msg-${msg.id}`}
      className="flex flex-col items-start gap-1.5 group w-full my-1.5"
    >
      <div className="px-4 py-3.5 rounded-[22px] rounded-tl-sm bg-white dark:bg-[#1c1c1e] text-gray-900 dark:text-gray-100 border border-gray-200/60 dark:border-gray-800/60 shadow-xs max-w-[95%] sm:max-w-[90%] text-xs sm:text-sm leading-relaxed overflow-hidden">
        
        {/* Attachments */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {msg.attachments.map(at => (
              <FileCard 
                key={at.id} 
                at={at} 
                onReference={(attachment) => onReferenceAttachment?.(attachment)}
                onEnlarge={(url) => onEnlargeImage?.(url)}
              />
            ))}
          </div>
        )}

        {/* Dynamic Blocks: Thought -> Tool Call -> Text */}
        {blocks.length > 0 ? (
          <div className="flex flex-col gap-3">
            {blocks.map((block, i) => {
              if (block.type === 'thought') {
                return (
                  <ThoughtBlock 
                    key={`thought-${i}`}
                    content={block.content}
                    onRun={onRunCode || (() => {})}
                    onFullScreen={onFullScreenCode || (() => {})}
                    theme={theme}
                    onEnlarge={onEnlargeImage}
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
                  <div 
                    key={`tc-${i}`}
                    className="flex flex-col gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden my-1"
                  >
                    <div 
                      className="flex flex-col gap-1 px-3 py-2 text-xs text-gray-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => toggleExpandedToolCall(tcId)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-3 h-3 text-brand dark:text-brand-dark" />
                          <span>{t('tool_call', '调用工具')}: <span className="font-mono text-brand dark:text-brand-dark">{tc.function.name}</span></span>
                        </div>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </div>
                      {isExpanded && (
                        <div className="mt-1 space-y-2">
                          <div className="font-mono text-[11px] p-2.5 bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 rounded-md overflow-x-auto border border-gray-200 dark:border-gray-700">
                            <div className="text-gray-500 dark:text-gray-400 mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider">{t('parameters', '参数')}:</div>
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
                          {t('execution_result', '执行结果')}
                        </div>
                        <div className="font-mono text-[11px] text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words overflow-x-auto max-h-[300px]">
                          {result}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              if (block.type === 'text') {
                return (
                  <div key={`text-${i}`} className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-transparent prose-pre:p-0 prose-pre:rounded-[12px] prose-a:text-brand dark:prose-a:text-brand-dark break-words [word-break:break-word]
                    prose-p:text-gray-900 dark:prose-p:text-gray-100 
                    prose-headings:text-gray-900 dark:prose-headings:text-white prose-headings:font-semibold
                    prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-bold
                    prose-li:text-gray-900 dark:prose-li:text-gray-100 font-sans">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                      components={{
                        p: ({ children }: any) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                        code({ node, inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          const lang = match ? match[1] : '';
                          const codeStr = String(children).replace(/\n$/, '');

                          if (!inline && lang === 'mermaid') {
                            return (
                              <Mermaid 
                                chart={codeStr} 
                                onEnlarge={(url) => onEnlargeImage?.(url)}
                              />
                            );
                          }

                          if (!inline) {
                            if (onApplyCodeToVFS) {
                              return (
                                <StudioCodeBlock
                                  language={lang || 'html'}
                                  code={codeStr}
                                  onApplyToVFS={onApplyCodeToVFS}
                                />
                              );
                            }

                            return (
                              <CodeBlock 
                                language={lang} 
                                onRun={onRunCode || (() => {})}
                                onFullScreen={onFullScreenCode || (() => {})}
                                theme={theme}
                              >
                                {children}
                              </CodeBlock>
                            );
                          }

                          return (
                            <code {...props} className={`${className || ''} bg-gray-100 dark:bg-gray-800/80 text-brand dark:text-brand-dark px-1.5 py-0.5 rounded-md font-mono text-[11px]`}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {block.content}
                    </ReactMarkdown>
                  </div>
                );
              }

              return null;
            })}
          </div>
        ) : (
          <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm">
            <ReactMarkdown>{displayContent}</ReactMarkdown>
          </div>
        )}

        {/* Error message display if any */}
        {isMsgError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-xl text-red-700 dark:text-red-400 text-xs flex items-start gap-2 mt-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <div className="whitespace-pre-wrap break-words">{displayContent}</div>
          </div>
        )}

        {/* Streaming loading dots */}
        {isStreaming && isLastMessage && !displayContent && blocks.length === 0 && (
          <div className="flex items-center gap-1.5 h-5 py-1">
            <span className="w-2 h-2 bg-brand rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-brand rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-brand rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>

      {/* Toolbar */}
      <ChatMessageToolbar
        messageId={msg.id}
        role="assistant"
        content={displayContent}
        isStreaming={isStreaming}
        isPinned={msg.isPinned}
        speakingId={speakingId}
        copiedId={copiedId}
        currentVersionIndex={currentVersionIndex}
        totalVersions={versions.length}
        bubbleToolsConfig={toolbarConfig}
        onCopy={onCopyMessage}
        onRegenerate={onRegenerateMessage}
        onSpeak={onSpeakMessage}
        onBranch={onBranchMessage}
        onTogglePin={onTogglePinMessage}
        onDelete={onDeleteMessage}
        onEdit={(id) => {
          setIsEditing(true);
          setEditingContent(displayContent);
        }}
        onSwitchVersion={onSwitchVersionMessage}
      />
    </motion.div>
  );
};
