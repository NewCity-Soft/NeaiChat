import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Minimize2, Terminal, Code, Edit2, Check, Sparkles, Copy } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { transform } from 'sucrase';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import { getPyodide, setPyodideProgressCallback, setupCustomInput, preparePythonCode } from '../services/tools';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-dart';
import 'prismjs/components/prism-zig';
import 'prismjs/components/prism-lua';

interface CodeRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  language: string;
  autoRun?: boolean;
}

export function CodeRunnerModal({ isOpen, onClose, code: initialCode, language, autoRun = false }: CodeRunnerModalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'logs'>('code');
  const [isEditing, setIsEditing] = useState(false);
  const [editableCode, setEditableCode] = useState(initialCode);
  const [sqlEngine, setSqlEngine] = useState<any>(null);
  const [initProgress, setInitProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: '' });
  const [copied, setCopied] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  const [iframePermissions, setIframePermissions] = useState<string>("");

  useEffect(() => {
    setEditableCode(initialCode);
    setIsEditing(false);
    setLogs([]);
  }, [initialCode, isOpen]);

  useEffect(() => {
    if (activeTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  useEffect(() => {
    const code = editableCode.toLowerCase();
    const perms = [];
    if (code.includes('geolocation')) perms.push('geolocation');
    if (code.includes('getusermedia') || code.includes('camera') || code.includes('microphone')) {
      perms.push('camera', 'microphone');
    }
    setIframePermissions(perms.join('; '));
  }, [editableCode]);

  useEffect(() => {
    if (isOpen && autoRun) {
      runCode();
    }
  }, [isOpen, autoRun]);

  const runCode = async () => {
    setIsRunning(true);
    setLogs([]);
    setActiveTab('logs');
    
    const lowerLang = language.toLowerCase();
    
    if (lowerLang === 'python' || lowerLang === 'py') {
      await runPython();
    } else if (lowerLang === 'sql') {
      await runSQL();
    } else if (lowerLang === 'lua') {
      await runLua();
    } else if (['js', 'javascript', 'ts', 'typescript', 'tsx', 'html'].includes(lowerLang)) {
      await runJavaScript();
    } else {
      addLog(`[ERROR] 本地环境暂不支持直接运行 ${lowerLang}。目前仅支持 JS, TS, Python, HTML, SQL 和 Lua。`);
    }
    
    setIsRunning(false);
  };

  const runLua = async () => {
    try {
      addLog('[INFO] 初始化 Lua 运行环境...');
      const { LuaFactory } = await import('wasmoon');
      const factory = new LuaFactory();
      const lua = await factory.createEngine();
      
      addLog('[INFO] Lua 环境已就绪。');

      // Hook print function
      lua.global.set('print', (...args: any[]) => {
        addLog(args.map(a => String(a)).join('\t'));
      });

      await lua.doString(editableCode);
    } catch (error: any) {
      addLog(`[LUA ERROR] ${error.message}`);
    }
  };

  const runSQL = async () => {
    try {
      addLog('[INFO] 初始化 SQL 运行环境...');
      let engine = sqlEngine;
      if (!engine) {
        const initSqlJs = (await import('sql.js')).default;
        engine = await initSqlJs({
          locateFile: file => `/sqljs/${file}`
        });
        setSqlEngine(engine);
      }
      
      const db = new engine.Database();
      addLog('[INFO] SQL 环境已就绪。');

      // Simple parser to split statements by semicolon (naive approach)
      const statements = editableCode.split(';').map(s => s.trim()).filter(s => s.length > 0);
      
      for (const sql of statements) {
        addLog(`[SQL] ${sql};`);
        try {
          const res = db.exec(sql);
          if (res.length > 0) {
            for (const table of res) {
              // Print header
              addLog(`| ${table.columns.join(' | ')} |`);
              addLog(`| ${table.columns.map(() => '---').join(' | ')} |`);
              // Print rows
              for (const row of table.values) {
                addLog(`| ${row.join(' | ')} |`);
              }
              addLog('\n');
            }
          } else {
            addLog('[INFO] 执行成功（无返回结果）');
          }
        } catch (e: any) {
          addLog(`[SQL ERROR] ${e.message}`);
        }
      }
      
      db.close();
    } catch (error: any) {
      addLog(`[SQL ENGINE ERROR] ${error.message}`);
    }
  };

  const runPython = async () => {
    try {
      addLog('[INFO] 初始化 Python 运行环境...');
      
      setPyodideProgressCallback((percent, message) => {
        setInitProgress({ percent, message });
        if (message) addLog(`[INFO] ${message}`);
      });

      const py = await getPyodide();
      setupCustomInput(py);
      
      addLog('[INFO] Python 环境已就绪。');
      setInitProgress({ percent: 100, message: '环境就绪' });

      // Capture stdout
      py.setStdout({
        batched: (str: string) => addLog(str)
      });
      py.setStderr({
        batched: (str: string) => addLog(`[ERROR] ${str}`)
      });

      // 自动分析代码中的 import 并安装缺失的包
      try {
        await py.loadPackagesFromImports(editableCode);
      } catch (e) {
        console.warn('自动加载包失败:', e);
      }

      const codeToRun = preparePythonCode(py, editableCode);
      await py.runPythonAsync(codeToRun);
    } catch (error: any) {
      addLog(`[PYTHON ERROR] ${error.message}`);
      setInitProgress({ percent: 0, message: '初始化失败' });
    }
  };

  const runJavaScript = async () => {
    const isHTML = language.toLowerCase() === 'html';
    addLog(`[INFO] 正在本地安全环境运行 ${isHTML ? '代码' : 'JavaScript/TypeScript'}...`);

    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleInfo = console.info;

    console.log = (...args) => addLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    console.error = (...args) => addLog(`[ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`);
    console.warn = (...args) => addLog(`[WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`);
    console.info = (...args) => addLog(`[INFO] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`);

    try {
      // Basic transpilation for TypeScript if needed
      let codeToRun = editableCode;
      const lowerLang = language.toLowerCase();
      if (lowerLang === 'typescript' || lowerLang === 'ts' || lowerLang === 'tsx') {
        try {
          codeToRun = transform(codeToRun, { transforms: ['typescript'] }).code;
        } catch (e) {
          addLog(`[TS COMPILE ERROR] Failed to transpile typescript: ${e}`);
        }
      }

      // Execute code
      const execute = new Function(codeToRun);
      execute();
    } catch (error: any) {
      addLog(`[EXECUTION ERROR] ${error.message}`);
    } finally {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      console.info = originalConsoleInfo;
    }
  };

  const getPrismLanguage = (lang: string) => {
    if (!lang) return languages.js;
    const l = lang.toLowerCase();
    if (l === 'js' || l === 'javascript') return languages.js;
    if (l === 'ts' || l === 'typescript' || l === 'tsx') return languages.ts || languages.js;
    if (l === 'py' || l === 'python') return languages.python;
    if (l === 'html' || l === 'xml' || l === 'svg') return languages.markup;
    if (l === 'css') return languages.css;
    if (l === 'java') return languages.java;
    if (l === 'c') return languages.c;
    if (l === 'cpp' || l === 'c++') return languages.cpp;
    if (l === 'rust' || l === 'rs') return languages.rust;
    if (l === 'go') return languages.go;
    if (l === 'ruby') return languages.ruby;
    if (l === 'php') return languages.php;
    if (l === 'sql') return languages.sql;
    if (l === 'kt' || l === 'kotlin') return languages.kotlin;
    if (l === 'swift') return languages.swift;
    if (l === 'scala') return languages.scala;
    if (l === 'dart') return languages.dart;
    if (l === 'zig') return languages.zig;
    if (l === 'lua') return languages.lua;
    return languages.js;
  };

  const isRunnable = ['js', 'javascript', 'ts', 'typescript', 'tsx', 'py', 'python', 'html', 'sql', 'lua'].includes(language.toLowerCase());

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-5xl h-[85vh] bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#1c1c1e] flex-wrap gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex bg-gray-200/70 dark:bg-gray-800/70 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('code')}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-md text-[13px] sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'code'
                      ? 'bg-white dark:bg-[#2c2c2e] text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Code className="w-4 h-4 shrink-0" />
                  <span>代码</span>
                </button>
                {isRunnable && (
                  <button
                    onClick={() => setActiveTab('logs')}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-md text-[13px] sm:text-sm font-medium transition-colors whitespace-nowrap ${
                      activeTab === 'logs'
                        ? 'bg-white dark:bg-[#2c2c2e] text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Terminal className="w-4 h-4 shrink-0" />
                    <span>输出</span>
                  </button>
                )}
              </div>
              <span className="text-[11px] sm:text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded whitespace-nowrap">
                {language}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsEditing(!isEditing);
                  if (!isEditing) setActiveTab('code');
                }}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors text-[13px] sm:text-sm font-medium whitespace-nowrap border ${
                  isEditing
                    ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/20'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {isEditing ? (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>完成编辑</span>
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4 shrink-0" />
                    <span>编辑代码</span>
                  </>
                )}
              </button>
              {isRunnable && (
                <button
                  onClick={runCode}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-brand dark:bg-brand-dark text-white rounded-lg hover:bg-brand/90 dark:hover:bg-brand-dark/90 transition-colors disabled:opacity-50 text-[13px] sm:text-sm font-medium whitespace-nowrap"
                >
                  <Play className="w-4 h-4 shrink-0" />
                  <span>{isRunning ? '运行中...' : '运行代码'}</span>
                </button>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(editableCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors text-[13px] sm:text-sm font-medium whitespace-nowrap border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 shrink-0 text-green-500" />
                    <span className="text-green-500">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>复制</span>
                  </>
                )}
              </button>
              <div className="w-px h-5 sm:h-6 bg-gray-200 dark:bg-gray-700 mx-1 sm:mx-2" />
              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95"
              >
                <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden relative bg-[#1e1e1e] flex flex-col">
            {/* Progress Bar for Python Initialization */}
            <AnimatePresence>
              {initProgress.percent > 0 && initProgress.percent < 100 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-brand/10 dark:bg-brand-dark/10 border-b border-brand/20 px-4 py-2"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-brand animate-pulse" />
                      <span className="text-xs font-medium text-brand dark:text-brand-dark">{initProgress.message}</span>
                    </div>
                    <span className="text-xs font-bold text-brand">{initProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-brand dark:bg-brand-dark"
                      initial={{ width: 0 }}
                      animate={{ width: `${initProgress.percent}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 overflow-hidden relative">
              {activeTab === 'code' ? (
              <div className="h-full overflow-auto">
                {isEditing ? (
                  <Editor
                    value={editableCode}
                    onValueChange={code => setEditableCode(code)}
                    highlight={code => highlight(code, getPrismLanguage(language), language)}
                    padding={24}
                    style={{
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      fontSize: 14,
                      minHeight: '100%',
                      backgroundColor: '#1e1e1e',
                      color: '#d4d4d4',
                    }}
                    className="editor-content"
                    textareaClassName="outline-none"
                  />
                ) : (
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={language}
                    customStyle={{ margin: 0, padding: '1.5rem', height: '100%', fontSize: '14px', backgroundColor: '#1e1e1e' }}
                    showLineNumbers
                  >
                    {editableCode}
                  </SyntaxHighlighter>
                )}
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-6 font-mono text-sm text-gray-300">
                {language.toLowerCase() === 'html' ? (
                  <iframe className="w-full h-full bg-white rounded-md" srcDoc={editableCode} title="HTML Preview" allow={iframePermissions} />
                ) : logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <Terminal className="w-12 h-12 mb-4 opacity-20" />
                    <p>暂无输出日志</p>
                    <p className="text-xs mt-2 opacity-60">点击右上角运行按钮执行代码</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log, i) => (
                      <div key={i} className="whitespace-pre-wrap break-words border-b border-gray-800/50 pb-1 mb-1">
                        <span className="text-gray-500 mr-4 text-xs select-none">{String(i + 1).padStart(3, '0')}</span>
                        <span className={
                          log.startsWith('[ERROR]') ? 'text-red-400' :
                          log.startsWith('[WARN]') ? 'text-yellow-400' :
                          log.startsWith('[INFO]') ? 'text-blue-400' :
                          'text-gray-300'
                        }>{log}</span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
