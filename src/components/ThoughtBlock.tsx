import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, ChevronUp, ChevronDown } from 'lucide-react';
import { Mermaid } from './MermaidRenderer';
import { CodeBlock } from './CodeBlock';
import { useTranslation } from '../i18n';

export const parseThought = (content: string) => {
  // Case 1: Standard <think>...</think> or <think>... (ongoing)
  const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
  if (thinkMatch) {
    const thought = thinkMatch[1];
    const rest = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trim();
    return { thought, rest };
  }
  
  // Case 2: Only </think> exists (missing opening tag)
  // We treat everything before the first </think> as thought if it appears
  if (content.includes('</think>')) {
    const index = content.indexOf('</think>');
    const thought = content.substring(0, index);
    const rest = content.substring(index + 8).trim(); // 8 is length of </think>
    return { thought, rest };
  }

  return { thought: null, rest: content };
};

export const ThoughtBlock = ({ 
  content, 
  onRun, 
  onFullScreen, 
  theme,
  onEnlarge,
  onReference
}: { 
  content: string; 
  onRun: (code: string, lang: string) => void; 
  onFullScreen: (code: string, lang: string) => void; 
  theme: 'light' | 'dark';
  onEnlarge?: (url: string) => void;
  onReference?: (code: string) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { t } = useTranslation();
  return (
    <div className="mb-4 border-l-2 border-gray-100 dark:border-gray-800 pl-4 py-2 bg-gray-50/50 dark:bg-gray-800/30 rounded-r-xl">
      <div 
        className="flex items-center gap-2 cursor-pointer select-none mb-2 opacity-60 hover:opacity-100 transition-opacity"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Brain className="w-3.5 h-3.5 text-brand dark:text-brand-dark" />
        <span className="font-semibold text-[10px] uppercase tracking-wider">{t('thought_process', '思考过程')}</span>
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed italic prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
                components={{
                  p: ({ children }: any) => <div className="mb-2 last:mb-0">{children}</div>,
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const lang = match ? match[1] : '';
                    if (!inline && lang === 'mermaid') {
                      return <Mermaid 
                        chart={String(children).replace(/\n$/, '')} 
                        onEnlarge={onEnlarge}
                        onReference={onReference}
                      />;
                    }
                    return !inline ? (
                      <CodeBlock 
                        language={lang} 
                        onRun={onRun}
                        onFullScreen={onFullScreen}
                        theme={theme}
                      >
                        {children}
                      </CodeBlock>
                    ) : (
                      <code {...props} className={`${className || ''} bg-gray-100 dark:bg-gray-800/60 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded-md font-mono text-[13px] border border-gray-200/50 dark:border-gray-700/50 break-words [word-break:break-word] not-italic`}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
