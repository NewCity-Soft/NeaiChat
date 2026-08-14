import Epub from 'epub-gen-memory';
import { AppSettings } from '../types';
import { transform } from 'sucrase';
import { cacheMedia } from '../utils/mediaCache';
import { getVFSFiles, getVFSFileByPath, saveVFSFile, deleteVFSFile, VFSItem } from '../utils/vfs';

export interface ToolContext {
  projectVFS?: VFSItem[];
  onUpdateProjectVFS?: (files: VFSItem[]) => void;
}

async function resolveVFSFiles(context?: ToolContext): Promise<VFSItem[]> {
  if (context?.projectVFS !== undefined) {
    return context.projectVFS;
  }
  return await getVFSFiles();
}

async function resolveVFSFileByPath(pathOrName: string, context?: ToolContext): Promise<VFSItem | null> {
  const files = await resolveVFSFiles(context);
  const cleanPath = pathOrName.trim().startsWith('/') ? pathOrName.trim() : `/${pathOrName.trim()}`;
  const rawName = pathOrName.trim().replace(/^\/+/, '');
  return files.find(f => f.path === cleanPath || f.name === rawName || f.path === rawName || f.id === pathOrName) || null;
}

async function resolveSaveVFSFile(params: { path: string; name: string; type: string; content: string; isBase64?: boolean }, context?: ToolContext): Promise<VFSItem> {
  const cleanPath = params.path.startsWith('/') ? params.path : `/${params.path}`;
  const newItem: VFSItem = {
    id: crypto.randomUUID(),
    path: cleanPath,
    name: params.name,
    type: params.type || 'text/plain',
    size: new Blob([params.content]).size,
    content: params.content,
    isBase64: params.isBase64 || false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (context?.projectVFS && context?.onUpdateProjectVFS) {
    const existing = context.projectVFS;
    const index = existing.findIndex(f => f.path === cleanPath || f.name === params.name);
    let updated: VFSItem[];
    if (index >= 0) {
      newItem.id = existing[index].id;
      newItem.createdAt = existing[index].createdAt;
      updated = existing.map((f, i) => i === index ? newItem : f);
    } else {
      updated = [newItem, ...existing];
    }
    context.onUpdateProjectVFS(updated);
    return newItem;
  } else {
    return await saveVFSFile(params);
  }
}

async function resolveDeleteVFSFile(pathOrName: string, context?: ToolContext): Promise<boolean> {
  const file = await resolveVFSFileByPath(pathOrName, context);
  if (!file) return false;

  if (context?.projectVFS && context?.onUpdateProjectVFS) {
    const updated = context.projectVFS.filter(f => f.id !== file.id && f.path !== file.path);
    context.onUpdateProjectVFS(updated);
    return true;
  } else {
    return await deleteVFSFile(file.path);
  }
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: any, settings: AppSettings, context?: ToolContext) => Promise<any>;
}

import { requestCustomInput } from './inputService';

// Lazy load engines to save memory
let pyodide: any = null;
let pyodideLoading: Promise<any> | null = null;
let onProgressCallback: ((progress: number, message: string) => void) | null = null;
let sqlEngine: any = null;

export const setPyodideProgressCallback = (callback: (progress: number, message: string) => void) => {
  onProgressCallback = callback;
};

export const setupCustomInput = (instance: any) => {
  if (!instance) return;
  try {
    if (typeof instance.setStdin === 'function') {
      instance.setStdin({
        stdin: () => {
          const res = '';
          return res !== null ? res + '\n' : '\n';
        },
      });
    }

    instance.runPython(`
import builtins
import js
import ast

async def _custom_input(prompt=""):
    p = "" if prompt is None else str(prompt)
    res = await js.showCustomInputDialog(p)
    return "" if res is None else str(res)

builtins._custom_input = _custom_input
builtins.input = _custom_input

def _transform_python_input_code(code_str):
    try:
        tree = ast.parse(code_str)
        
        class InputTransformer(ast.NodeTransformer):
            def visit_Call(self, node):
                self.generic_visit(node)
                if isinstance(node.func, ast.Name) and node.func.id == 'input':
                    node.func.id = '_custom_input'
                    return ast.Await(value=node)
                return node

            def visit_Await(self, node):
                if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == 'input':
                    node.value.func.id = '_custom_input'
                    return node
                self.generic_visit(node)
                return node
                
        transformed_tree = InputTransformer().visit(tree)
        ast.fix_missing_locations(transformed_tree)
        return ast.unparse(transformed_tree)
    except Exception:
        return code_str
    `);
  } catch (inputErr) {
    console.warn('Failed to setup custom input():', inputErr);
  }
};

export const preparePythonCode = (instance: any, code: string): string => {
  if (!instance || !code) return code;
  try {
    if (code.includes('input(')) {
      const transformFunc = instance.globals.get('_transform_python_input_code');
      if (transformFunc) {
        const transformed = transformFunc(code);
        return typeof transformed === 'string' ? transformed : code;
      }
    }
  } catch (err) {
    console.warn('Transform python code input error:', err);
  }
  return code;
};

export async function getPyodide() {
  if (pyodide) return pyodide;
  if (pyodideLoading) return pyodideLoading;

  pyodideLoading = (async () => {
    try {
      console.log('Initializing Pyodide...');
      onProgressCallback?.(10, '正在初始化 Pyodide 核心...');
      
      const baseUrl = (import.meta as any).env?.BASE_URL || '/';
      const localIndexURL = new URL(baseUrl + 'pyodide/', window.location.origin).href;
      const defaultCdnURL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

      const loadScript = (url: string, forceReload = false): Promise<any> => {
        return new Promise((resolve, reject) => {
          if (!forceReload && (window as any).loadPyodide) {
            resolve((window as any).loadPyodide);
            return;
          }
          const existing = document.getElementById('pyodide-script');
          if (existing) existing.remove();
          delete (window as any).loadPyodide;

          const script = document.createElement('script');
          script.id = 'pyodide-script';
          script.src = `${url}pyodide.js`;
          script.onload = () => {
            if ((window as any).loadPyodide) {
              resolve((window as any).loadPyodide);
            } else {
              reject(new Error('Pyodide 脚本文件已加载，但未找到 loadPyodide 入口。'));
            }
          };
          script.onerror = () => {
            script.remove();
            reject(new Error(`无法获取脚本: ${script.src}`));
          };
          document.head.appendChild(script);
        });
      };

      const checkWasmAvailable = async (url: string) => {
        try {
          const resp = await fetch(url + 'pyodide.asm.wasm', { method: 'HEAD' });
          return resp.ok;
        } catch {
          return false;
        }
      };

      let loadPyodideFunc: any = (window as any).loadPyodide;

      // 1. 尝试动态导入 (npm 模式)
      if (!loadPyodideFunc) {
        try {
          const mod = await import('pyodide');
          loadPyodideFunc = mod.loadPyodide;
        } catch (e) {
          console.warn('Pyodide dynamic import failed:', e);
        }
      }

      // 2. 检测本地 WASM 是否真实有效
      onProgressCallback?.(20, '正在检查 Python 运行时资源...');
      const localWasmOk = await checkWasmAvailable(localIndexURL);

      const loadInstanceWithTimeout = async (loadFunc: any, indexURL: string, timeoutMs: number) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Pyodide 在 (${indexURL}) 初始化超时 (${timeoutMs / 1000}s)`));
          }, timeoutMs);

          loadFunc({
            indexURL,
            stdout: (text: string) => console.log(`[Pyodide STDOUT] ${text}`),
            stderr: (text: string) => console.error(`[Pyodide STDERR] ${text}`),
          }).then((inst: any) => {
            clearTimeout(timer);
            resolve(inst);
          }).catch((err: any) => {
            clearTimeout(timer);
            reject(err);
          });
        });
      };

      let instance: any = null;
      let finalUsedURL = '';

      // 3. 如果本地 WASM 存在，尝试本地初始化 (10秒限时)
      if (localWasmOk) {
        try {
          onProgressCallback?.(40, '正在初始化本地 WASM 运行时 (10秒限时)...');
          if (!loadPyodideFunc) {
            loadPyodideFunc = await loadScript(localIndexURL);
          }
          instance = await loadInstanceWithTimeout(loadPyodideFunc, localIndexURL, 10000);
          finalUsedURL = localIndexURL;
        } catch (localErr: any) {
          console.warn('Local Pyodide init failed or timed out:', localErr);
        }
      } else {
        console.warn('Local pyodide.asm.wasm not accessible, falling back directly to CDN.');
      }

      // 4. 本地不可用或初始化失败时，尝试 CDN
      if (!instance) {
        onProgressCallback?.(55, '正在尝试从远程 CDN 加载 Python 运行时...');
        try {
          const cdnLoadFunc = await loadScript(defaultCdnURL, true);
          instance = await loadInstanceWithTimeout(cdnLoadFunc, defaultCdnURL, 30000);
          finalUsedURL = defaultCdnURL;
        } catch (cdnErr: any) {
          console.error('CDN Pyodide init failed:', cdnErr);
          throw new Error('Pyodide WASM 加载失败：本地与 CDN 均不可用或超时。请检查网络环境或稍后重试。');
        }
      }

      onProgressCallback?.(80, '正在加载扩展支持 (micropip)...');
      try {
        await instance.loadPackage('micropip');
      } catch (pkgError) {
        console.warn('micropip 加载跳过:', pkgError);
      }

      onProgressCallback?.(100, '环境就绪');
      console.log('Pyodide initialized successfully using:', finalUsedURL);
      
      setupCustomInput(instance);

      pyodide = instance;
      return instance;
    } catch (error) {
      pyodideLoading = null;
      console.error('Failed to initialize Pyodide:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      onProgressCallback?.(0, '初始化失败: ' + errorMsg);
      throw error;
    }
  })();

  return pyodideLoading;
}

export const tools: Tool[] = [
  {
    name: 'vfs_list_files',
    description: '查看虚拟文件系统 (VFS) 中的所有存储文件列表及属性（文件名、路径、大小、类型、最后修改时间）。',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (args, settings, context) => {
      try {
        const files = await resolveVFSFiles(context);
        if (files.length === 0) {
          return '虚拟文件系统 (VFS) 当前为空，暂无存储的文件。';
        }
        const summary = files.map(f => {
          return `- 路径: ${f.path}\n  文件名: ${f.name}\n  类型: ${f.type}\n  大小: ${f.size} 字节\n  更新时间: ${new Date(f.updatedAt).toLocaleString('zh-CN')}`;
        }).join('\n');
        return `虚拟文件系统 (VFS) 文件列表（共 ${files.length} 个文件）：\n\n${summary}`;
      } catch (err: any) {
        return `读取文件列表失败: ${err.message}`;
      }
    },
  },
  {
    name: 'vfs_read_file',
    description: '从虚拟文件系统 (VFS) 中读取指定路径或文件名的文件内容。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件的虚拟路径（例如 "/data.csv"）或文件名（例如 "welcome.md"）' }
      },
      required: ['path'],
    },
    execute: async ({ path }: { path: string }, settings, context) => {
      try {
        const file = await resolveVFSFileByPath(path, context);
        if (!file) {
          return `错误：未在虚拟文件系统 (VFS) 中找到文件 "${path}"。可以使用 vfs_list_files 查看已有文件。`;
        }
        if (file.isBase64) {
          return `文件 "${file.path}" (类型: ${file.type}, 大小: ${file.size} 字节) 为二进制或媒体文件，其 Data URL/Base64 内容太长未直接展开。可以直接传递该路径进行其他工具处理。`;
        }
        return `=== 虚拟文件 "${file.path}" 内容 (${file.size} 字节) ===\n${file.content}`;
      } catch (err: any) {
        return `读取文件失败: ${err.message}`;
      }
    },
  },
  {
    name: 'vfs_write_file',
    description: '在虚拟文件系统 (VFS) 中创建新文件或覆盖写入已存在的文件内容。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '写入的文件虚拟路径（例如 "/output/report.txt" 或 "notes.md"）' },
        content: { type: 'string', description: '文件内容文本' },
        type: { type: 'string', description: '可选，MIME类型（例如 "text/plain", "text/markdown", "application/json"），默认为 text/plain' }
      },
      required: ['path', 'content'],
    },
    execute: async ({ path, content, type = 'text/plain' }: { path: string; content: string; type?: string }, settings, context) => {
      try {
        if (!path) {
          return '写入文件失败: path 不能为空';
        }
        const saved = await resolveSaveVFSFile({
          path,
          name: path.split('/').pop() || 'file.txt',
          type,
          content,
          isBase64: false,
        }, context);
        return `成功在虚拟文件系统 (VFS) 中保存文件！路径: ${saved.path}，大小: ${saved.size} 字节。`;
      } catch (err: any) {
        return `写入文件失败: ${err.message}`;
      }
    },
  },
  {
    name: 'vfs_delete_file',
    description: '从虚拟文件系统 (VFS) 中删除指定路径的文件。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要删除的文件虚拟路径或文件名' }
      },
      required: ['path'],
    },
    execute: async ({ path }: { path: string }, settings, context) => {
      try {
        if (!path) return '写入文件失败: path 不能为空';
        const success = await resolveDeleteVFSFile(path, context);
        if (success) {
          return `成功从虚拟文件系统 (VFS) 中删除文件 "${path}"。`;
        } else {
          return `未找到要删除的文件 "${path}"。`;
        }
      } catch (err: any) {
        return `删除文件失败: ${err.message}`;
      }
    },
  },
  {
    name: 'get_current_time',
    description: '获取当前时间（北京时间）',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    },
  },
  {
    name: 'reset_python_environment',
    description: '重置 Python 环境，清除所有已定义的变量、导入的模块。这有助于解决因状态冲突引起的问题。',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      pyodide = null;
      pyodideLoading = null;
      return 'Python 环境已重置。下一次运行 Python 代码时将重新加载全新的环境。';
    },
  },
  {
    name: 'calculator',
    description: '计算数学表达式',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: '数学表达式，例如 "2 + 2" 或 "Math.sqrt(16)"',
        },
      },
      required: ['expression'],
    },
    execute: async ({ expression }) => {
      try {
        const result = new Function(`return (${expression})`)();
        return result.toString();
      } catch (error: any) {
        return `Error: ${error.message}`;
      }
    },
  },
  {
    name: 'generate_random_number',
    description: '生成指定范围内的随机数',
    parameters: {
      type: 'object',
      properties: {
        min: { type: 'number', description: '最小值' },
        max: { type: 'number', description: '最大值' },
      },
      required: ['min', 'max'],
    },
    execute: async ({ min, max }) => {
      return Math.floor(Math.random() * (max - min + 1) + min).toString();
    },
  },
  {
    name: 'internet_search',
    description: '在互联网上搜索实时信息，用于回答关于时事、新闻或需要最新数据的问题。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
      },
      required: ['query'],
    },
    execute: async ({ query }, settings) => {
      if (!settings.searchApiKey) {
        return '错误：未配置搜索 API Key。请在设置中配置 Tavily API Key 以启用此功能。';
      }
      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: settings.searchApiKey,
            query: query,
            search_depth: 'basic',
            max_results: 5,
          }),
        });
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          return data.results.map((r: any) => `标题: ${r.title}\n链接: ${r.url}\n摘要: ${r.content}`).join('\n\n');
        }
        return '未找到相关搜索结果。';
      } catch (error: any) {
        return `搜索失败: ${error.message}`;
      }
    },
  },
  {
    name: 'run_js_code',
    description: '在安全沙箱中执行 JavaScript 或 TypeScript 代码。支持 ESNext 语法和 TypeScript 转换。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的代码字符串' },
        isTypeScript: { type: 'boolean', description: '是否为 TypeScript 代码' },
      },
      required: ['code'],
    },
    execute: async ({ code, isTypeScript }) => {
      const logs: string[] = [];
      const mockConsole = {
        log: (...args: any[]) => logs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')),
        error: (...args: any[]) => logs.push(`Error: ${args.join(' ')}`),
        warn: (...args: any[]) => logs.push(`Warning: ${args.join(' ')}`),
      };

      try {
        let codeToRun = code;
        if (isTypeScript) {
          codeToRun = transform(code, { transforms: ['typescript'] }).code;
        }

        const fn = new Function('console', `
          try {
            ${codeToRun}
          } catch (e) {
            console.error(e.message);
          }
        `);
        const result = fn(mockConsole);
        
        let output = logs.join('\n');
        if (result !== undefined) {
          output += `\n\n返回值: ${JSON.stringify(result, null, 2)}`;
        }
        return output || '代码执行成功（无输出）。';
      } catch (e: any) {
        return `代码执行错误: ${e.message}`;
      }
    },
  },
  {
    name: 'run_python_code',
    description: '在 Pyodide (WASM) 沙箱中执行 Python 代码。支持标准库和基本数据处理。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的 Python 代码' },
      },
      required: ['code'],
    },
    execute: async ({ code }) => {
      try {
        const instance = await getPyodide();
        
        // 确保内置 input() 在每次执行时有效
        setupCustomInput(instance);

        const codeToRun = preparePythonCode(instance, code);
        const hasInput = code.includes('input(');

        // 自动分析代码中的 import 并安装缺失的包
        try {
          await instance.loadPackagesFromImports(code);
        } catch (e) {
          console.warn('自动加载包失败:', e);
        }

        // List files before to detect new ones
        const beforeFiles = new Set(instance.FS.readdir('.'));
        
        const logs: string[] = [];
        instance.setStdout({ batched: (str: string) => logs.push(str) });
        instance.setStderr({ batched: (str: string) => logs.push(`[ERROR] ${str}`) });
        
        // Execution with timeout (Give 5 minutes if waiting for user input)
        const timeoutMs = hasInput ? 300000 : 60000;
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Python 执行超时 (${timeoutMs / 1000}秒)`)), timeoutMs)
        );
        
        const result = await Promise.race([
          instance.runPythonAsync(codeToRun),
          timeoutPromise
        ]);
        
        // List files after
        const afterFiles = instance.FS.readdir('.');
        const newFiles = afterFiles.filter((f: string) => !beforeFiles.has(f) && f !== '.' && f !== '..');
        
        let output = logs.join('\n');
        if (result !== undefined && result !== null) {
          try {
            // Check if result is a proxy and convert to JS
            const jsResult = result.toJs ? result.toJs() : result;
            output += `\n\n返回值: ${typeof jsResult === 'object' ? JSON.stringify(jsResult, null, 2) : jsResult}`;
            
            // Cleanup proxies if any
            if (result.destroy) result.destroy();
          } catch (e) {
            output += `\n\n返回值: ${result}`;
          }
        }
        
        const attachments: any[] = [];
        if (newFiles.length > 0) {
          for (const filename of newFiles) {
            try {
              // Avoid reading potentially massive binary files unless they look like something we want
              const stats = instance.FS.stat(filename);
              if (stats.size > 10 * 1024 * 1024) { // skip > 10MB
                output += `\n[跳过读取大文件: ${filename} (${(stats.size / 1024 / 1024).toFixed(1)}MB)]`;
                continue;
              }

              const data = instance.FS.readFile(filename);
              const extension = filename.split('.').pop()?.toLowerCase();
              let mimeType = 'application/octet-stream';
              
              if (extension === 'png') mimeType = 'image/png';
              else if (extension === 'jpg' || extension === 'jpeg') mimeType = 'image/jpeg';
              else if (extension === 'csv') mimeType = 'text/csv';
              else if (extension === 'txt') mimeType = 'text/plain';
              else if (extension === 'json') mimeType = 'application/json';
              else if (extension === 'pdf') mimeType = 'application/pdf';

              const blob = new Blob([data], { type: mimeType });
              const reader = new FileReader();
              const base64Promise = new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              
              const dataUrl = await base64Promise;
              
              attachments.push({
                id: crypto.randomUUID(),
                name: filename,
                type: mimeType,
                url: dataUrl,
                size: data.length
              });
            } catch (e) {
              console.error(`Failed to read file ${filename}:`, e);
            }
          }
        }

        if (attachments.length > 0) {
          output += `\n\n[已生成 ${attachments.length} 个文件]`;
        }

        return {
          content: output || 'Python 代码执行成功（无输出）。',
          attachments: attachments.length > 0 ? attachments : undefined
        };
      } catch (error: any) {
        return `Python 执行错误: ${error.message}`;
      }
    },
  },
  {
    name: 'run_sql_query',
    description: '使用 SQL.js (SQLite WASM) 执行 SQL 查询。你可以创建表、插入数据并进行查询。',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL 语句，多条语句用分号分隔' },
      },
      required: ['sql'],
    },
    execute: async ({ sql }) => {
      try {
        if (!sqlEngine) {
          const initSqlJs = (await import('sql.js')).default;
          sqlEngine = await initSqlJs({ locateFile: file => `/sqljs/${file}` });
        }
        
        const db = new sqlEngine.Database();
        const results = db.exec(sql);
        db.close();
        
        if (results.length === 0) return '执行成功（无返回结果）。';
        
        return results.map((table: any) => {
          const header = `| ${table.columns.join(' | ')} |`;
          const divider = `| ${table.columns.map(() => '---').join(' | ')} |`;
          const rows = table.values.map((row: any) => `| ${row.join(' | ')} |`).join('\n');
          return `${header}\n${divider}\n${rows}`;
        }).join('\n\n');
      } catch (error: any) {
        return `SQL 执行错误: ${error.message}`;
      }
    },
  },
  {
    name: 'run_lua_code',
    description: '在 Wasmoon (WASM) 环境中执行 Lua 代码。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '要执行的 Lua 代码' },
      },
      required: ['code'],
    },
    execute: async ({ code }) => {
      try {
        const { LuaFactory } = await import('wasmoon');
        const factory = new LuaFactory();
        const lua = await factory.createEngine();
        const logs: string[] = [];
        
        lua.global.set('print', (...args: any[]) => {
          logs.push(args.map(a => String(a)).join('\t'));
        });
        
        await lua.doString(code);
        return logs.join('\n') || 'Lua 代码执行成功（无输出）。';
      } catch (error: any) {
        return `Lua 执行错误: ${error.message}`;
      }
    },
  },
  {
    name: 'execute_ssh_command',
    description: '在远程服务器上通过 SSH 执行命令。你需要先在设置中配置远程服务器和 SSH Bridge。',
    parameters: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: '要连接的服务器 ID（从配置列表中选择）' },
        command: { type: 'string', description: '要执行的 shell 命令' },
      },
      required: ['server_id', 'command'],
    },
    execute: async ({ server_id, command }, settings) => {
      const server = settings.remoteServers?.find(s => s.id === server_id);
      if (!server) {
        const serverList = (settings.remoteServers || []).map(s => `${s.name} (${s.id})`).join(', ');
        return `错误：找不到服务器 ID "${server_id}"。可用服务器: ${serverList || '无'}`;
      }

      if (!settings.sshBridgeUrl) {
        return '错误：未配置 SSH Bridge URL。请在设置 -> 远程服务器中配置中转地址。';
      }

      try {
        const response = await fetch(settings.sshBridgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            server,
            command
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          return `远程执行失败 (${response.status}): ${err.error || response.statusText}`;
        }

        const data = await response.json();
        return data.output || data.result || '执行成功，无输出。';
      } catch (error: any) {
        return `SSH 桥接连接失败: ${error.message}`;
      }
    },
  },
  {
    name: 'unit_converter',
    description: '在不同的测量单位之间进行转换。支持长度(m, km, ft, inch)、重量(kg, g, lb, oz)和温度(C, F)。',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number', description: '数值' },
        from: { type: 'string', description: '源单位 (例如: "m", "kg", "C")' },
        to: { type: 'string', description: '目标单位 (例如: "ft", "lb", "F")' },
      },
      required: ['value', 'from', 'to'],
    },
    execute: async ({ value, from, to }) => {
      const conversions: Record<string, number> = {
        'm-ft': 3.28084, 'ft-m': 1 / 3.28084,
        'm-km': 0.001, 'km-m': 1000,
        'kg-lb': 2.20462, 'lb-kg': 1 / 2.20462,
        'g-oz': 0.035274, 'oz-g': 1 / 0.035274,
      };

      const key = `${from}-${to}`;
      if (conversions[key]) return (value * conversions[key]).toFixed(4);

      if (from === 'C' && to === 'F') return (value * 9/5 + 32).toFixed(2);
      if (from === 'F' && to === 'C') return ((value - 32) * 5/9).toFixed(2);

      return `暂不支持从 ${from} 到 ${to} 的转换。`;
    },
  },
  {
    name: 'password_generator',
    description: '生成安全的随机密码。',
    parameters: {
      type: 'object',
      properties: {
        length: { type: 'number', description: '密码长度，默认为 12' },
        includeSymbols: { type: 'boolean', description: '是否包含特殊字符' },
        includeNumbers: { type: 'boolean', description: '是否包含数字' },
      },
    },
    execute: async ({ length = 12, includeSymbols = true, includeNumbers = true }) => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const nums = '0123456789';
      const syms = '!@#$%^&*()_+~`|}{[]:;?><,./-=';
      let charset = chars;
      if (includeNumbers) charset += nums;
      if (includeSymbols) charset += syms;
      
      let retVal = '';
      for (let i = 0; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return retVal;
    },
  },
  {
    name: 'color_tool',
    description: '在 Hex 和 RGB 颜色格式之间转换，或生成随机颜色。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['hex_to_rgb', 'rgb_to_hex', 'random'], description: '执行的操作' },
        value: { type: 'string', description: '颜色值 (例如 "#ff0000" 或 "255,0,0")' },
      },
      required: ['action'],
    },
    execute: async ({ action, value }) => {
      if (action === 'random') {
        const hex = Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        return `#${hex}`;
      }
      if (action === 'hex_to_rgb' && value) {
        const r = parseInt(value.slice(1, 3), 16);
        const g = parseInt(value.slice(3, 5), 16);
        const b = parseInt(value.slice(5, 7), 16);
        return `rgb(${r}, ${g}, ${b})`;
      }
      if (action === 'rgb_to_hex' && value) {
        const [r, g, b] = value.split(',').map((v: string) => parseInt(v.trim()));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      }
      return '无效的操作或参数。';
    },
  },
  {
    name: 'base64_tool',
    description: 'Base64 编码与解码工具。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['encode', 'decode'], description: '编码或解码' },
        text: { type: 'string', description: '要处理的文本' },
      },
      required: ['action', 'text'],
    },
    execute: async ({ action, text }) => {
      try {
        if (action === 'encode') return btoa(unescape(encodeURIComponent(text)));
        if (action === 'decode') return decodeURIComponent(escape(atob(text)));
      } catch (e: any) {
        return `错误: ${e.message}`;
      }
      return '无效操作。';
    },
  },
  {
    name: 'update_memory',
    description: 'Update the system prompt to remember things about the user or update your persona. Call this tool when the user asks you to remember something, change your behavior, or when you learn something new that should be persisted across sessions.',
    parameters: {
      type: 'object',
      properties: {
        newSystemPrompt: { type: 'string', description: 'The completely updated system prompt including the new memory/rules.' },
      },
      required: ['newSystemPrompt'],
    },
    execute: async ({ newSystemPrompt }) => {
      return { content: `Memory updated successfully. New system prompt: ${newSystemPrompt}` };
    },
  },
  {
    name: 'generate_image',
    description: '根据描述生成图片。请在设置中配置图像生成供应商和模型。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '对图片的详细描述' },
        size: { type: 'string', enum: ['256x256', '512x512', '1024x1024'], description: '图片尺寸' },
        model: { type: 'string', description: '可选，仅在用户明确要求特定模型时使用，否则请留空' },
        image_reference_url: { type: 'string', description: '可选，参考图链接，用于图生图、垫图或风格迁移。支持 VFS 路径（如 "/my_photo.png"）' },
        style: { type: 'string', description: '可选，风格描述，例如 "艺术照片", "3D 渲染", "素描", "赛博朋克"' },
        save_to_vfs_path: { type: 'string', description: '可选，将生成的图片保存到虚拟文件系统 (VFS) 的路径（如 "/generated/car.png"）' },
      },
      required: ['prompt'],
    },
    execute: async ({ prompt, size = '1024x1024', model, image_reference_url, style, save_to_vfs_path }, settings, context) => {
      const config = settings.imageGen;
      const apiUrl = config?.apiUrl || settings.apiUrl;
      const apiKey = config?.apiKey || settings.apiKey;

      if (!apiKey || !apiUrl) {
        return '错误：未配置图像生成 API。请在设置 -> 媒体生成中配置供应商或确保主模型供应商已配置。';
      }

      try {
        const targetModel = model || config?.model || 'dall-e-3';
        const baseUrl = apiUrl.replace(/\/+$/, '');
        const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/images/generations` : `${baseUrl}/v1/images/generations`;

        // 构建请求体，精简不必要的参数以避免 LiteLLM / 第三方中转网关的 UnsupportedParamsError
        const finalPrompt = style ? `${prompt} --style ${style}` : prompt;
        const requestBody: any = {
          model: targetModel,
          prompt: finalPrompt,
          response_format: 'b64_json',
        };

        if (size && size !== '1024x1024') {
          requestBody.size = size;
        }
        
        // 解析参考图，支持 VFS 路径
        let finalImageRef = image_reference_url;
        if (image_reference_url && (image_reference_url.startsWith('/') || !image_reference_url.includes('://'))) {
          const vfsFile = await resolveVFSFileByPath(image_reference_url, context);
          if (vfsFile) {
            finalImageRef = vfsFile.content; // content 为 Data URL 或文本
          }
        }

        if (finalImageRef) {
          requestBody.image_url = finalImageRef;
        }

        let response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        // 若遇到 400 参数不被中转/模型支持错误 (如 response_format, size, drop_params 等)，尝试仅保留最核心的 model 与 prompt 重试
        if (!response.ok && response.status === 400) {
          const errText = await response.clone().text().catch(() => '');
          if (errText.includes('UnsupportedParams') || errText.includes('unsupported') || errText.includes('drop_params') || errText.includes('response_format') || errText.includes('param')) {
            const minimalBody = {
              model: targetModel,
              prompt: finalPrompt
            };
            const retryResp = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify(minimalBody)
            });
            if (retryResp.ok) {
              response = retryResp;
            }
          }
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          return `图像生成失败 (${response.status}): ${errData.error?.message || response.statusText}`;
        }

        const data = await response.json();
        let imageUrl = data.data?.[0]?.url || data.url || data.image;
        if (!imageUrl && data.data?.[0]?.b64_json) {
          const b64 = data.data[0].b64_json;
          imageUrl = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
        }

        if (!imageUrl) return '生成的响应中没有找到图片链接。';

        // 自动将生成的图片持久化存储到 IndexedDB 缓存中，防止远程链接过期或下载毁坏
        const cachedUrl = await cacheMedia(imageUrl, 'image/png').catch(() => imageUrl);

        // 如果指定了保存到 VFS
        let vfsNotice = '';
        if (save_to_vfs_path) {
          try {
            const fileName = save_to_vfs_path.split('/').pop() || 'generated_image.png';
            await resolveSaveVFSFile({
              path: save_to_vfs_path,
              name: fileName,
              type: 'image/png',
              content: imageUrl, // Base64 data url
              isBase64: true
            }, context);
            vfsNotice = `\n\n[文件已保存至 VFS: ${save_to_vfs_path}]`;
          } catch (vfsErr: any) {
            vfsNotice = `\n\n[保存至 VFS 失败: ${vfsErr.message}]`;
          }
        }

        return {
          content: `已成功生成图片。\n\n![${prompt}](${cachedUrl})\n\n描述: ${prompt}${vfsNotice}`,
          attachments: [{
            id: crypto.randomUUID(),
            name: `${prompt.slice(0, 20)}.png`,
            type: 'image/png',
            url: cachedUrl,
            size: 0
          }]
        };
      } catch (error: any) {
        return `图像生成请求出错: ${error.message}`;
      }
    },
  },
  {
    name: 'generate_video',
    description: '根据描述或图片生成视频。请在设置中配置视频生成供应商和模型。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '对视频场景、动作和风格的详细描述' },
        imageUrl: { type: 'string', description: '可选，作为视频生成的起始图片链接' },
        endImageUrl: { type: 'string', description: '可选，结束帧图片链接，用于关键帧之间的平滑过渡' },
        aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3'], description: '可选，视频宽高比' },
        motion_score: { type: 'number', description: '可选，运动幅度 (1-10)' },
        model: { type: 'string', description: '可选，仅在用户明确要求特定模型时使用，否则请留空' },
        save_to_vfs_path: { type: 'string', description: '可选，将生成的视频保存到虚拟文件系统 (VFS) 的路径（如 "/generated/video.mp4"）' },
      },
      required: ['prompt'],
    },
    execute: async ({ prompt, imageUrl, endImageUrl, aspect_ratio, motion_score, model, save_to_vfs_path }, settings, context) => {
      const config = settings.videoGen;
      const apiUrl = config?.apiUrl || settings.apiUrl;
      const apiKey = config?.apiKey || settings.apiKey;

      if (!apiKey || !apiUrl) {
        return '错误：未配置视频生成 API。请在设置 -> 媒体生成中配置供应商或确保主模型供应商已配置。';
      }

      try {
        const targetModel = model || config?.model || 'luma-gen-1';
        const baseUrl = apiUrl.replace(/\/+$/, '');
        
        // 解析输入图片，支持 VFS 路径
        let finalImageUrl = imageUrl;
        if (imageUrl && (imageUrl.startsWith('/') || !imageUrl.includes('://'))) {
          const vfsFile = await resolveVFSFileByPath(imageUrl, context);
          if (vfsFile) finalImageUrl = vfsFile.content;
        }

        let finalEndImageUrl = endImageUrl;
        if (endImageUrl && (endImageUrl.startsWith('/') || !endImageUrl.includes('://'))) {
          const vfsFile = await resolveVFSFileByPath(endImageUrl, context);
          if (vfsFile) finalEndImageUrl = vfsFile.content;
        }

        let endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/videos/generations` : `${baseUrl}/v1/videos/generations`;
        if (apiUrl.includes('siliconflow')) {
          endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/video/submit` : `${baseUrl}/v1/video/submit`;
        }

        const requestBody: any = {
          model: targetModel,
          prompt,
          image_url: finalImageUrl,
          start_image_url: finalImageUrl,
          end_image_url: finalEndImageUrl,
          aspect_ratio: aspect_ratio || '16:9',
          motion: motion_score
        };

        let response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        // 兼容其他通用 API 平台使用 `/v1/video/generations` 单数命名
        if (response.status === 404 && !apiUrl.includes('siliconflow')) {
          const fallbackEndpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/video/generations` : `${baseUrl}/v1/video/generations`;
          response = await fetch(fallbackEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
          });
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          return `视频生成失败 (${response.status}): ${errData.error?.message || response.statusText}`;
        }

        const data = await response.json();
        
        // 硅基流动异步生成任务流处理
        if (data.requestId || apiUrl.includes('siliconflow')) {
          const requestId = data.requestId;
          const statusEndpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/video/status` : `${baseUrl}/v1/video/status`;
          
          let videoUrl = '';
          let isComplete = false;
          let retries = 0;
          const maxRetries = 60; // 60 * 5s = 5 minutes
          
          while (!isComplete && retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            const statusRes = await fetch(statusEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({ requestId })
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === 'Succeed' || statusData.status === 'success') {
                videoUrl = statusData.results?.[0]?.url || statusData.video_url || statusData.url;
                isComplete = true;
              } else if (statusData.status === 'Failed' || statusData.status === 'failed') {
                return `视频生成任务失败: ${statusData.reason || '未知错误'}`;
              }
            }
            retries++;
          }
          if (!videoUrl) return '视频生成超时，未能获取到视频链接。';
          
          const cachedUrl = await cacheMedia(videoUrl, 'video/mp4').catch(() => videoUrl);

          // 如果指定了保存到 VFS
          let vfsNotice = '';
          if (save_to_vfs_path) {
            try {
              const fileName = save_to_vfs_path.split('/').pop() || 'generated_video.mp4';
              await resolveSaveVFSFile({
                path: save_to_vfs_path,
                name: fileName,
                type: 'video/mp4',
                content: videoUrl, // Base64 data url or URL
                isBase64: true
              }, context);
              vfsNotice = `\n\n[文件已保存至 VFS: ${save_to_vfs_path}]`;
            } catch (vfsErr: any) {
              vfsNotice = `\n\n[保存至 VFS 失败: ${vfsErr.message}]`;
            }
          }

          return {
            content: `视频生成成功！\n\n[点击查看视频](${cachedUrl})\n\n描述: ${prompt}${vfsNotice}`,
            attachments: [{
              id: `video-${Date.now()}`,
              name: `video-${Date.now()}.mp4`,
              url: cachedUrl,
              type: 'video/mp4'
            }]
          };
        }

        const videoUrl = data.video_url || data.url || data.data?.[0]?.url;
        const taskId = data.id || data.task_id;

        if (videoUrl) {
          // 自动将生成的视频持久化存储到 IndexedDB 缓存中，防止远程链接过期或下载损坏
          const cachedUrl = await cacheMedia(videoUrl, 'video/mp4').catch(() => videoUrl);

          // 如果指定了保存到 VFS
          let vfsNotice = '';
          if (save_to_vfs_path) {
            try {
              const fileName = save_to_vfs_path.split('/').pop() || 'generated_video.mp4';
              await resolveSaveVFSFile({
                path: save_to_vfs_path,
                name: fileName,
                type: 'video/mp4',
                content: videoUrl, // Base64 data url or URL
                isBase64: true
              }, context);
              vfsNotice = `\n\n[文件已保存至 VFS: ${save_to_vfs_path}]`;
            } catch (vfsErr: any) {
              vfsNotice = `\n\n[保存至 VFS 失败: ${vfsErr.message}]`;
            }
          }

          return {
            content: `视频生成成功！\n\n[点击查看视频](${cachedUrl})\n\n描述: ${prompt}${vfsNotice}`,
            attachments: [{
              id: crypto.randomUUID(),
              name: `${prompt.slice(0, 20)}.mp4`,
              type: 'video/mp4',
              url: cachedUrl,
              size: 0
            }]
          };
        } else if (taskId) {
          return `视频生成任务已提交，任务 ID: ${taskId}。请稍后查询结果。`;
        }

        return '生成请求已发送，但未返回即时视频链接。';
      } catch (error: any) {
        return `视频生成请求出错: ${error.message}`;
      }
    },
  },
  {
    name: 'generate_mind_map',
    description: '根据提供的文本或主题生成思维导图。请返回 Mermaid 语法的 mindmap 代码块。示例格式：\nmindmap\n  root((主题))\n    分支1\n      子分支A\n    分支2\n',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Mermaid mindmap 代码 (以 mindmap 开头)' },
        title: { type: 'string', description: '思维导图标题' },
      },
      required: ['code'],
    },
    execute: async ({ code, title }) => {
      return {
        content: `已为您生成思维导图：${title || ''}\n\n\`\`\`mermaid\n${code}\n\`\`\``
      };
    },
  },
  {
    name: 'request_user_input',
    description: '弹出自定义 UI 对话框请求用户提供输入（如文本、数字、密码、日期或单选选项等）。当需要用户明确做出决定、提供个人偏好或缺失参数时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '向用户展示的提示说明或问题' },
        inputType: {
          type: 'string',
          enum: ['text', 'number', 'password', 'select', 'color', 'date'],
          description: '要求的输入类型，默认 text。若选择 select，请务必在 options 中提供选项列表。'
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '当 inputType 为 select 时的可选项列表'
        },
        title: { type: 'string', description: '弹窗标题，默认“AI 助手请求输入”' },
        placeholder: { type: 'string', description: '输入框占位提示文本' },
      },
      required: ['prompt'],
    },
    execute: async ({ prompt, inputType = 'text', options, title = 'AI 助手请求输入', placeholder }) => {
      const value = await requestCustomInput(prompt, {
        inputType,
        options,
        title,
        placeholder,
      });
      return {
        content: value ? `用户提供了以下输入：${value}` : '用户取消了输入或提交了空内容。'
      };
    },
  },
  {
    name: 'download_vfs_file',
    description: '触发浏览器下载虚拟文件系统 (VFS) 中的指定文件，支持自定义格式。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要下载的文件在 VFS 中的路径或名称' },
        format: { type: 'string', description: '可选，覆盖下载时的文件扩展名 (如 "pdf", "csv", "json")' },
        newFilename: { type: 'string', description: '可选，重命名下载的文件名 (包含扩展名)' }
      },
      required: ['path'],
    },
    execute: async ({ path, format, newFilename }, settings, context) => {
      try {
        const file = await resolveVFSFileByPath(path, context);
        if (!file) return `未找到文件 ${path}`;
        
        let blob: Blob;
        let mimeType = file.type || 'application/octet-stream';
        
        if (file.isBase64) {
          const match = file.content.match(/^data:(.*?);base64,(.*)$/);
          if (match) {
            mimeType = match[1];
            const bstr = atob(match[2]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
              u8arr[n] = bstr.charCodeAt(n);
            }
            blob = new Blob([u8arr], { type: mimeType });
          } else {
            blob = new Blob([file.content], { type: mimeType });
          }
        } else {
          blob = new Blob([file.content], { type: mimeType });
        }
        
        let downloadName = newFilename || file.name;
        if (format && !downloadName.endsWith('.' + format)) {
           downloadName = downloadName.split('.')[0] + '.' + format;
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        return `成功触发下载文件 ${downloadName}`;
      } catch (err: any) {
         return `触发下载失败: ${err.message}`;
      }
    }
  },
  {
    name: 'edit_epub',
    description: '创建或编辑 EPUB 电子书文件，将指定的标题、作者、章节内容打包为 EPUB 格式，并保存到 VFS 中。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '保存 EPUB 文件的 VFS 路径 (例如 "/books/my_book.epub")' },
        title: { type: 'string', description: '电子书标题' },
        author: { type: 'string', description: '电子书作者，默认 "Unknown"' },
        cover: { type: 'string', description: '可选，封面图片的 URL 或 VFS 路径 (例如 "/cover.jpg")' },
        chapters: { 
          type: 'array', 
          description: '电子书章节列表',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '章节标题' },
              content: { type: 'string', description: '章节 HTML 内容' }
            },
            required: ['title', 'content']
          }
        }
      },
      required: ['path', 'title', 'chapters']
    },
    execute: async ({ path, title, author = 'Unknown', cover, chapters }, settings, context) => {
      try {
        let coverUrl = cover;
        if (cover && cover.startsWith('/')) {
           const coverFile = await resolveVFSFileByPath(cover, context);
           if (coverFile) {
             coverUrl = coverFile.content;
           }
        }
        
        const EpubFn = (Epub as any).default || Epub;
        const epubBuffer = await EpubFn({
          title,
          author,
          cover: coverUrl,
        }, chapters.map((c: any) => ({
          title: c.title,
          content: c.content
        })));
        
        // epubBuffer is Buffer or Blob depending on environment.
        // Assuming it's an ArrayBuffer/Buffer in Node or Blob in browser.
        // We need to convert it to Base64 data URL to store in VFS.
        let base64data = '';
        if (epubBuffer instanceof Blob) {
           const reader = new FileReader();
           base64data = await new Promise((resolve) => {
             reader.onloadend = () => resolve(reader.result as string);
             reader.readAsDataURL(epubBuffer);
           });
        } else if (epubBuffer instanceof ArrayBuffer || epubBuffer.buffer) {
           const uint8 = new Uint8Array(epubBuffer.buffer ? epubBuffer.buffer : epubBuffer);
           let binary = '';
           for (let i = 0; i < uint8.byteLength; i++) {
             binary += String.fromCharCode(uint8[i]);
           }
           base64data = 'data:application/epub+zip;base64,' + btoa(binary);
        } else if (typeof epubBuffer.toString === 'function') {
           // Buffer
           base64data = 'data:application/epub+zip;base64,' + epubBuffer.toString('base64');
        } else {
           throw new Error('未知的 EPUB 生成结果类型。');
        }

        const saved = await resolveSaveVFSFile({
          path,
          name: path.split('/').pop() || 'book.epub',
          type: 'application/epub+zip',
          content: base64data,
          isBase64: true
        }, context);
        
        return `成功生成并保存 EPUB 文件至 VFS，路径: ${saved.path}，大小: ${saved.size} 字节。`;
      } catch (err: any) {
        return `生成 EPUB 文件失败: ${err.message}`;
      }
    }
  },
];

export async function getToolDefinitions(settings: AppSettings) {
  let baseTools = tools.map(({ execute, ...def }) => def);
  
  if (!settings.autoEvolve) {
    baseTools = baseTools.filter(t => t.name !== 'update_memory');
  }
  
  if (!settings.mcpServers || settings.mcpServers.length === 0) {
    return baseTools;
  }

  const mcpTools: any[] = [];
  
  for (const server of settings.mcpServers) {
    if (!server.url) continue;
    try {
      const response = await fetch(server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 1
        })
      });
      const data = await response.json();
      if (data.result && data.result.tools) {
        data.result.tools.forEach((tool: any) => {
          mcpTools.push({
            ...tool,
            name: `mcp__${server.id}__${tool.name}`,
            description: `[MCP: ${server.name}] ${tool.description}`
          });
        });
      }
    } catch (e) {
      console.error(`Failed to fetch tools from MCP server ${server.name}:`, e);
    }
  }

  return [...baseTools, ...mcpTools];
}

export async function executeTool(name: string, args: any, settings: AppSettings, context?: ToolContext): Promise<{ content: string, attachments?: any[] }> {
  let result: any;
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    const serverId = parts[1];
    const toolName = parts[2];
    const server = settings.mcpServers?.find(s => s.id === serverId);
    
    if (!server || !server.url) {
      throw new Error(`MCP server not found or URL missing for ${serverId}`);
    }

    const response = await fetch(server.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        },
        id: 1
      })
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(`MCP Error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    if (data.result && data.result.content) {
      result = data.result.content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
    } else {
      result = JSON.stringify(data.result);
    }
  } else {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    result = await tool.execute(args, settings, context);
  }

  if (typeof result === 'object' && result !== null && 'content' in result) {
    return result;
  }
  return { content: String(result) };
}
