import React, { useRef, useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import vs from 'react-syntax-highlighter/dist/esm/styles/prism/vs';

interface UnifiedCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  filePath?: string;
  fileName?: string;
  theme?: 'light' | 'dark';
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

export const UnifiedCodeEditor: React.FC<UnifiedCodeEditorProps> = ({
  value,
  onChange,
  filePath = '',
  fileName = '',
  theme = 'light',
  readOnly = false,
  placeholder = '在此输入代码...',
  className = '',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlighterRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const isDark = theme === 'dark';

  // Determine language based on extension
  const name = fileName || filePath;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  let language = 'javascript';
  if (ext === 'html' || ext === 'htm') language = 'html';
  else if (ext === 'css') language = 'css';
  else if (ext === 'ts' || ext === 'tsx') language = 'typescript';
  else if (ext === 'js' || ext === 'jsx') language = 'javascript';
  else if (ext === 'json') language = 'json';
  else if (ext === 'md' || ext === 'markdown') language = 'markdown';
  else if (ext === 'py') language = 'python';
  else if (ext === 'sql') language = 'sql';
  else language = 'clike';

  // Calculate total lines
  const lines = value ? value.split('\n') : [''];
  const lineCount = lines.length;

  // Handle sync scrolling between textarea, syntax highlighter and line numbers
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (highlighterRef.current) {
      highlighterRef.current.scrollTop = scrollTop;
      highlighterRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  // Support Tab key indentation inside textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Insert 2 spaces
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);

      // Move cursor
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className={`relative flex flex-1 h-full w-full overflow-hidden font-mono text-xs ${
      isDark ? 'bg-[#18181b] text-gray-100' : 'bg-white text-gray-900'
    } ${className}`}>
      {/* Left Line Numbers Gutter */}
      <div
        ref={lineNumbersRef}
        className={`shrink-0 select-none py-4 px-2 text-right border-r font-mono text-[11px] leading-[1.6] overflow-hidden ${
          isDark
            ? 'bg-[#121214] text-gray-600 border-gray-800'
            : 'bg-gray-50 text-gray-400 border-gray-200'
        }`}
        style={{ minWidth: lineCount > 999 ? '52px' : '38px' }}
      >
        {Array.from({ length: lineCount }).map((_, idx) => (
          <div key={idx} className="h-[19.2px] leading-[19.2px]">
            {idx + 1}
          </div>
        ))}
      </div>

      {/* Code Editor Body Container */}
      <div className="relative flex-1 h-full w-full overflow-hidden">
        {/* Underlying Syntax Highlighter Layer */}
        <div
          ref={highlighterRef}
          className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none p-4"
          aria-hidden="true"
        >
          <SyntaxHighlighter
            language={language}
            style={isDark ? vscDarkPlus : vs}
            codeTagProps={{
              style: {
                fontFamily: 'inherit',
                fontSize: 'inherit',
                lineHeight: 'inherit',
              }
            }}
            customStyle={{
              margin: 0,
              padding: 0,
              background: 'transparent',
              fontSize: '12px',
              lineHeight: '1.6',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              whiteSpace: 'pre',
              wordBreak: 'normal',
              minWidth: '100%',
              display: 'inline-block',
            }}
          >
            {value || ' '}
          </SyntaxHighlighter>
        </div>

        {/* Foreground Transparent Editable Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          className={`absolute inset-0 w-full h-full p-4 font-mono text-xs leading-[1.6] bg-transparent resize-none focus:outline-none border-none whitespace-pre overflow-auto ${
            isDark
              ? 'text-transparent caret-blue-400 selection:bg-blue-900/50'
              : 'text-transparent caret-blue-600 selection:bg-blue-100'
          }`}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
};
