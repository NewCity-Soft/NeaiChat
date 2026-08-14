import { useState, Component, ReactNode, ErrorInfo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import prism from 'react-syntax-highlighter/dist/esm/styles/prism/prism';
import { Play, Check, Copy, Maximize2 } from 'lucide-react';
import { useTranslation } from '../i18n';

// Error Boundary for SyntaxHighlighter to prevent app crashes on internal highlighting errors
export class SyntaxErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SyntaxHighlighter Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const CodeBlock = ({ language, children, onRun, onFullScreen, theme }: { language: string; children: any; onRun: (code: string, lang: string) => void; onFullScreen: (code: string, lang: string) => void; theme: 'light' | 'dark' }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasLanguage = language && language !== 'text' && language !== 'txt';
  const RUNNABLE_LANGS = ['js', 'javascript', 'ts', 'typescript', 'tsx', 'py', 'python', 'html', 'sql', 'lua'];
  const isRunnable = hasLanguage && RUNNABLE_LANGS.includes(language.toLowerCase());

  if (!hasLanguage) {
    return (
      <code className="bg-gray-100 dark:bg-gray-800/60 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded-md font-mono text-[13px] border border-gray-200/50 dark:border-gray-700/50 break-words [word-break:break-word] whitespace-pre-wrap">
        {code}
      </code>
    );
  }

  return (
    <div className="rounded-[12px] overflow-hidden my-4 border border-gray-200/90 dark:border-gray-700/80 shadow-sm relative group bg-gray-50 dark:bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800/90 text-xs text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 font-sans">
        <span className="font-medium uppercase tracking-wider text-[10px] text-gray-600 dark:text-gray-400">{language}</span>
        <div className="flex items-center gap-1.5">
          {isRunnable && (
            <button
              onClick={() => onRun(code, language)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-brand dark:text-brand-dark hover:bg-brand/10 dark:hover:bg-brand-dark/10 rounded-md transition-colors text-[11px] font-medium whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 shrink-0" />
              <span>{t('run_code', '运行代码')}</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors flex items-center gap-1 px-2 text-gray-600 dark:text-gray-300 cursor-pointer"
            title={t('copy_code', '复制代码')}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">{t('copied', '已复制')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[10px] font-medium">{t('copy', '复制')}</span>
              </>
            )}
          </button>
          <button
            onClick={() => onFullScreen(code, language)}
            className="p-1 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-600 dark:text-gray-300 cursor-pointer"
            title={t('fullscreen_display', '全屏显示')}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      <div className="relative">
        <SyntaxErrorBoundary 
          fallback={
            <pre className={`p-4 ${theme === 'dark' ? 'bg-[#1e1e1e] text-gray-100' : 'bg-gray-50 text-gray-900'} overflow-x-auto text-[13px] font-mono whitespace-pre`}>
              {code}
            </pre>
          }
        >
          <SyntaxHighlighter
            style={theme === 'dark' ? vscDarkPlus : prism}
            language={language}
            PreTag="div"
            customStyle={{ 
              margin: 0, 
              padding: '1rem',
              borderRadius: 0, 
              overflowX: 'auto', 
              fontSize: '13px',
              backgroundColor: theme === 'dark' ? '#1e1e1e' : '#f8fafc',
              color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
              lineHeight: '1.6'
            }}
          >
            {code}
          </SyntaxHighlighter>
        </SyntaxErrorBoundary>
      </div>
    </div>
  );
};
