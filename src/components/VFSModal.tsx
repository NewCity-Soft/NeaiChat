import React, { useState, useEffect, useRef } from 'react';
import { Folder, Upload, FileText, Image, FileCode, Trash2, Plus, Download, Copy, Eye, Edit3, X, Check, RefreshCw, File, HardDrive, FileSpreadsheet, Paperclip, ArrowLeft, Search, ArrowDownAz, Clock, ArrowDownWideNarrow, ChevronDown, MoreHorizontal, Move, Archive, Play, Terminal, Loader2, Save, BookOpen } from 'lucide-react';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { requestCustomInput } from '../services/inputService';
import { customConfirm } from '../services/dialogService';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { VFSItem, getVFSFiles, saveVFSFile, deleteVFSFile, fileToVFS, subscribeVFSChange, deleteVFSFiles, moveVFSFiles } from '../utils/vfs';
import { Attachment } from '../types';
import { UnifiedCodeEditor } from './UnifiedCodeEditor';
import { EpubViewer } from './EpubViewer';

interface VFSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInjectToContext?: (attachment: Attachment) => void;
  showToast?: (message: string, type?: 'info' | 'warning' | 'error' | 'success') => void;
  isExportDisabled?: boolean;
}

export const VFSModal: React.FC<VFSModalProps> = ({ isOpen, onClose, onInjectToContext, showToast, isExportDisabled = false }) => {
  const [files, setFiles] = useState<VFSItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<VFSItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editPath, setEditPath] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('date');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileTab, setSelectedFileTab] = useState<'preview' | 'edit'>('preview');
  const [isMoving, setIsMoving] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [isFileSearchOpen, setIsFileSearchOpen] = useState(false);
  const fileSearchInputRef = useRef<HTMLInputElement>(null);

  const [newDirPath, setNewDirPath] = useState('');
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [currentDir, setCurrentDir] = useState<string>('/');
  const [executionResult, setExecutionResult] = useState<{ output: string; error?: boolean } | null>(null);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [exportMenuFile, setExportMenuFile] = useState<VFSItem | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentPreviewRef = useRef<HTMLDivElement>(null);

  const handleRunCode = async (file: VFSItem) => {
    if (!file || file.isBase64) return;
    
    setIsRunningCode(true);
    setExecutionResult(null);
    
    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    // Capture console output
    console.log = (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
    console.error = (...args) => logs.push('ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
    console.warn = (...args) => logs.push('WARN: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));

    try {
      // Create a sandbox-like execution
      const run = new Function(file.content);
      run();
      setExecutionResult({ output: logs.length > 0 ? logs.join('\n') : '(执行成功，无输出内容)' });
    } catch (err: any) {
      setExecutionResult({ output: logs.join('\n') + `\n\n运行时错误: ${err.message}`, error: true });
    } finally {
      // Restore console
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      setIsRunningCode(false);
    }
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePointerDown = (id: string) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      toggleSelect(id);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30);
      }
    }, 450);
  };

  const handlePointerUpOrLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedFiles.map(f => f.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (await customConfirm(`确定要批量删除选中的 ${selectedIds.size} 个文件吗？`)) {
      await deleteVFSFiles(Array.from(selectedIds));
      setSelectedIds(new Set());
      if (selectedFile && selectedIds.has(selectedFile.id)) {
        setSelectedFile(null);
      }
    }
  };

  const handleBulkMove = async () => {
    if (selectedIds.size === 0 || !newDirPath) return;
    await moveVFSFiles(Array.from(selectedIds), newDirPath);
    setSelectedIds(new Set());
    setIsMoving(false);
    setNewDirPath('');
  };

  const handleExportZip = async () => {
    if (selectedIds.size === 0) return;
    setIsExportingZip(true);
    try {
      const zip = new JSZip();
      const selectedFiles = files.filter(f => selectedIds.has(f.id));

      selectedFiles.forEach(file => {
        let relativePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
        if (!relativePath) relativePath = file.name;

        if (file.isBase64 || file.content.startsWith('data:')) {
          const base64Data = file.content.includes(',') ? file.content.split(',')[1] : file.content;
          zip.file(relativePath, base64Data, { base64: true });
        } else {
          zip.file(relativePath, file.content);
        }
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vfs_export_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (showToast) {
        showToast(`已成功导出 ${selectedFiles.length} 个文件为 ZIP 压缩包`, 'success');
      }
    } catch (err: any) {
      console.error('ZIP Export Error:', err);
      if (showToast) {
        showToast(`导出 ZIP 失败: ${err.message || '未知错误'}`, 'error');
      }
    } finally {
      setIsExportingZip(false);
    }
  };

  // CSV 解析器
  const renderCSVTable = (content: string) => {
    const lines = content.trim().split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return <p className="text-gray-400 text-xs">文件内容为空</p>;
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^["']|["']$/g, '')));

    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700">
              {headers.map((h, idx) => (
                <th key={idx} className="px-3 py-2 font-semibold whitespace-nowrap border-r border-gray-200/50 dark:border-gray-700/50 last:border-r-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700/50">
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-3 py-2 text-gray-800 dark:text-gray-200 whitespace-nowrap border-r border-gray-200/50 dark:border-gray-700/50 last:border-r-0 font-mono text-[11px]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const loadFiles = async () => {
    const list = await getVFSFiles();
    setFiles(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
    const unsubscribe = subscribeVFSChange(() => {
      loadFiles();
    });
    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    const handleOpenPreview = async (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const path = customEvent.detail;
      const list = await getVFSFiles();
      const file = list.find(f => f.path === path);
      if (file) {
        setSelectedFile(file);
      }
    };
    window.addEventListener('open-vfs-preview', handleOpenPreview);
    return () => window.removeEventListener('open-vfs-preview', handleOpenPreview);
  }, []);

  useEffect(() => {
    setFileSearchQuery('');
    setIsFileSearchOpen(false);
  }, [selectedFile?.id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuFile(null);
      }
    };
    if (exportMenuFile) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuFile]);

  useEffect(() => {
    if (!fileSearchQuery.trim() || !contentPreviewRef.current) return;
    const container = contentPreviewRef.current;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    const frag = document.createDocumentFragment();
    const all = container.childNodes;
    const toRemove: Node[] = [];
    for (const node of all) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node as Text).textContent || '';
        const idx = text.toLowerCase().indexOf(fileSearchQuery.toLowerCase());
        if (idx === -1) continue;
        toRemove.push(node);
        if (idx > 0) frag.appendChild(text.slice(0, idx));
        const mark = document.createElement('mark');
        mark.className = 'bg-yellow-300 dark:bg-yellow-600/50 text-gray-900 dark:text-gray-100 rounded-sm px-0.5';
        mark.textContent = text.slice(idx, idx + fileSearchQuery.length);
        frag.appendChild(mark);
        if (idx + fileSearchQuery.length < text.length) {
          frag.appendChild(text.slice(idx + fileSearchQuery.length));
        }
      } else {
        frag.appendChild(node.cloneNode(true));
      }
    }
    for (const n of toRemove) n.parentNode?.removeChild(n);
  }, [fileSearchQuery]);

  if (!isOpen) return null;

  const mammothConvert = mammoth.convertToHtml;

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    let count = 0;
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      try {
        let targetPath = currentDir === '/' ? `/${f.name}` : `${currentDir}/${f.name}`;
        let content: string | ArrayBuffer;
        let mimeType = f.type || 'text/plain';

        // Auto-convert DOC/DOCX to markdown
        if (f.name.toLowerCase().endsWith('.doc')) {
          showToast?.(`文件 ${f.name} 为旧版 .doc 格式，请转换为 .docx 后重新上传`, 'warning');
          continue;
        }
        if (f.name.toLowerCase().endsWith('.docx')) {
          const arrayBuffer = await f.arrayBuffer();
          let htmlText = '';
          try {
            const result = await mammothConvert({ arrayBuffer });
            htmlText = result.value;
            if (result.messages.length > 0) {
              console.warn(`DOCX conversion warnings for ${f.name}:`, result.messages);
            }
          } catch (convErr: any) {
            throw new Error(`DOCX 转换失败: ${convErr.message || '未知错误'}`);
          }
          // Simple HTML → Markdown
          content = htmlText
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
            .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          mimeType = 'text/markdown';
          // Replace extension with .md
          targetPath = targetPath.replace(/\.docx?$/i, '.md');
          if (!content) {
            showToast?.(`文件 ${f.name} 转换后内容为空，可能是不支持格式`, 'warning');
          }
        } else {
          content = await f.text();
        }

        await saveVFSFile({
          path: targetPath,
          name: targetPath.split('/').pop()!,
          type: mimeType,
          content: content as string,
          isBase64: false,
          size: f.size,
        });
        count++;
      } catch (e: any) {
        showToast?.(`文件 ${f.name} 上传到 VFS 失败: ${e.message}`, 'error');
      }
    }
    if (count > 0) {
      showToast?.(`已成功添加 ${count} 个文件到 "${currentDir}"`, 'success');
      loadFiles();
    }
  };

  const handleStartCreateText = () => {
    setIsAddMenuOpen(false);
    const defaultPath = currentDir === '/' ? '/untitled.txt' : `${currentDir}/untitled.txt`;
    setNewFilePath(defaultPath);
    setNewFileContent('');
    setIsCreatingNew(true);
    setSelectedFile(null);
  };

  const handleCreateFolder = async () => {
    setIsAddMenuOpen(false);
    const folderName = await requestCustomInput(`在目录 "${currentDir}" 下新建文件夹名称：`, { title: '新建文件夹', placeholder: 'new_folder' });
    if (!folderName || !folderName.trim()) return;

    const cleanFolder = folderName.trim().replace(/^\/+|\/+$/g, '');
    
    // Prevent nested paths in folder name input for simplicity, or handle it
    if (cleanFolder.includes('/')) {
      showToast?.('文件夹名称不能包含 "/"', 'error');
      return;
    }

    const folderPath = currentDir === '/' ? `/${cleanFolder}` : `${currentDir}/${cleanFolder}`;
    const placeholderPath = `${folderPath}/.keep`;

    try {
      const item = await saveVFSFile({
        path: placeholderPath,
        name: '.keep',
        type: 'text/plain',
        content: '',
        isBase64: false,
        size: 0,
      });
      setCurrentDir(folderPath);
      showToast?.(`已成功创建文件夹 "${cleanFolder}"`, 'success');
      loadFiles();
    } catch (e: any) {
      showToast?.(`创建文件夹失败: ${e.message}`, 'error');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const handleDelete = async (file: VFSItem) => {
    if (await customConfirm(`确定要在虚拟文件系统中删除 "${file.path}" 吗？`, { title: '确认删除' })) {
      await deleteVFSFile(file.id);
      if (selectedFile?.id === file.id) {
        setSelectedFile(null);
        setIsEditing(false);
      }
      showToast?.(`已从 VFS 删除 ${file.name}`, 'info');
      loadFiles();
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedFile) return;
    try {
      await saveVFSFile({
        id: selectedFile.id,
        path: editPath || selectedFile.path,
        name: (editPath || selectedFile.path).split('/').pop() || selectedFile.name,
        type: selectedFile.type,
        content: editContent,
        isBase64: false,
      });
      setIsEditing(false);
      setIsModified(false);
      setSelectedFileTab('preview');
      showToast?.('VFS 文件保存成功', 'success');
      loadFiles();
      const updated = files.find(f => f.id === selectedFile.id);
      if (updated) setSelectedFile({ ...updated, content: editContent, path: editPath });
    } catch (e: any) {
      showToast?.(`保存失败: ${e.message}`, 'error');
    }
  };

  const handleCreateNewFile = async () => {
    if (!newFilePath.trim()) {
      showToast?.('请输入有效的虚拟路径，如 /notes/my_note.txt', 'warning');
      return;
    }
    try {
      const path = newFilePath.trim().startsWith('/') ? newFilePath.trim() : '/' + newFilePath.trim();
      const item = await saveVFSFile({
        path,
        name: path.split('/').pop() || 'new_file.txt',
        type: path.endsWith('.md') ? 'text/markdown' : path.endsWith('.json') ? 'application/json' : 'text/plain',
        content: newFileContent,
        isBase64: false,
      });
      setIsCreatingNew(false);
      setNewFilePath('');
      setNewFileContent('');
      setSelectedFile(item);
      showToast?.(`新文件 "${item.path}" 已成功建立到 VFS`, 'success');
      loadFiles();
    } catch (e: any) {
      showToast?.(`创建文件失败: ${e.message}`, 'error');
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
    showToast?.(`已复制虚拟路径: ${path}`, 'info');
  };

  const handleDownloadFile = (file: VFSItem) => {
    const blob = file.isBase64 
      ? dataURLtoBlob(file.content)
      : new Blob([file.content], { type: file.type });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(arr[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  // ─── Export format conversion helpers ─────────────────────────────────────────

  const mdToHtmlDoc = (md: string): string => {
    // Simple markdown → HTML headings/lists, then wrap in Word-compatible HTML
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
      .replace(/\n/g, '<br/>')
      .replace(/<\/li>\s*<li>/g, '</li><li>'); // fix list grouping
    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>Export</title>
        <style>body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6;}h1{font-size:20pt;}h2{font-size:16pt;}h3{font-size:14pt;}</style>
        </head><body>${html}</body></html>`;
  };

  const mdToPdf = async (md: string) => {
    const blob = new Blob([mdToHtmlDoc(md)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => {
        win.print();
      };
    }
  };

  const epubToTxt = async (base64Content: string): Promise<string> => {
    try {
      const zip = await JSZip.loadAsync(dataURLtoBlob(base64Content));
      const containerXml = await zip.file('META-INF/container.xml')?.async('text');
      const opfPath = containerXml?.match(/full-path="([^"]+\.opf)"/)?.[1] || 'OEBPS/content.opf';
      const opf = await zip.file(opfPath)?.async('text') || '';
      const manifestItems = [...opf.matchAll(/id="([^"]+)".+?href="([^"]+)"/g)].map(m => ({ id: m[1], href: m[2] }));
      const spines = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map(m => m[1]);
      let text = '';
      for (const ref of spines) {
        const item = manifestItems.find(m => m.id === ref);
        if (!item) continue;
        const chapter = await zip.file(item.href)?.async('text') || '';
        const plain = chapter.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plain) text += plain + '\n\n';
      }
      return text.trim();
    } catch {
      return base64Content.substring(0, 2000);
    }
  };

  const csvToExcel = (csv: string): void => {
    const wb = XLSX.utils.book_new();
    const data = [['a', 'b'].includes(csv.split('\n')[0]?.toLowerCase()) ? csv : csv];
    const ws = XLSX.utils.aoa_to_sheet(
      csv.split('\n').map(row => row.split(',').map(cell => cell.replace(/^["']|["']$/g, '').trim()))
    );
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, 'export.xlsx');
  };

  const csvToMd = (csv: string): string => {
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length === 0) return '';
    const header = lines[0].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
    const rows = lines.slice(1).map(l => l.split(',').map(c => c.replace(/^["']|["']$/g, '').trim()));
    const sep = '| ' + header.map(() => '---').join(' | ') + ' |';
    return '|' + header.map(h => ` ${h} `).join('|') + ' |\n' + sep + '\n' + rows.map(r => '|' + r.map(c => ` ${c} `).join('|') + '|').join('\n');
  };

  const csvToDocx = (csv: string): void => {
    const rows = csv.split('\n').map(l => l.split(',').map(c => `<td>${c.replace(/^["']|["']$/g, '').trim()}</td>`).join(''));
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><style>table{border-collapse:collapse;}td,th{border:1px solid #ccc;padding:4px 8px;font-size:10pt;}</style></head>
        <body><table>${rows.map(r => `<tr>${r}</tr>`).join('')}</table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.docx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const csvToPdf = async (csv: string) => {
    const rows = csv.split('\n').map(l => l.split(',').map(c => c.replace(/^["']|["']$/g, '').trim()));
    const html = `
      <html><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%;font-size:10pt;}th,td{border:1px solid #000;padding:4px 8px;}th{background:#f0f0f0;}@media print{body{-webkit-print-color-adjust:exact;}}</style></head>
      <body><table>${rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) { win.onload = () => { win.print(); }; }
  };

  const exportFileAs = (file: VFSItem, format: 'md' | 'docx' | 'pdf' | 'txt' | 'epub' | 'excel' | 'csv') => {
    const name = file.name.replace(/\.[^.]+$/, '') || file.name;
    // Direct download for original format
    if (format === 'epub' || format === 'csv') {
      handleDownloadFile(file);
      return;
    }
    if (file.type === 'text/markdown' || file.name.endsWith('.md')) {
      if (format === 'docx') {
        const html = mdToHtmlDoc(file.content);
        const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${name}.docx`; a.click(); URL.revokeObjectURL(url);
      } else if (format === 'pdf') {
        mdToPdf(file.content);
      }
    } else if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) {
      if (format === 'txt') {
        epubToTxt(file.content).then(txt => {
          const blob = new Blob([txt], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `${name}.txt`; a.click(); URL.revokeObjectURL(url);
        });
      } else if (format === 'md') {
        epubToTxt(file.content).then(txt => {
          const blob = new Blob([txt], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `${name}.md`; a.click(); URL.revokeObjectURL(url);
        });
      } else if (format === 'docx') {
        epubToTxt(file.content).then(txt => {
          const html = mdToHtmlDoc(txt);
          const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `${name}.docx`; a.click(); URL.revokeObjectURL(url);
        });
      }
    } else if (file.type.includes('csv') || file.name.endsWith('.csv')) {
      if (format === 'excel') csvToExcel(file.content);
      else if (format === 'pdf') csvToPdf(file.content);
      else if (format === 'docx') csvToDocx(file.content);
    }
    setExportMenuFile(null);
  };

  const getExportFormats = (file: VFSItem): { format: 'md'|'docx'|'pdf'|'txt'|'epub'|'excel'|'csv', label: string }[] => {
    if (file.type === 'text/markdown' || file.name.endsWith('.md')) return [
      { format: 'md', label: 'Markdown (.md)' }, { format: 'docx', label: 'Word DOCX (.docx)' }, { format: 'pdf', label: 'PDF (.pdf)' },
    ];
    if (file.type === 'application/epub+zip' || file.name.endsWith('.epub')) return [
      { format: 'txt', label: '纯文本 (.txt)' }, { format: 'epub', label: 'EPUB (.epub)' }, { format: 'md', label: 'Markdown (.md)' }, { format: 'docx', label: 'Word DOCX (.docx)' },
    ];
    if (file.type.includes('csv') || file.name.endsWith('.csv')) return [
      { format: 'excel', label: 'Excel (.xlsx)' }, { format: 'csv', label: 'CSV (.csv)' }, { format: 'md', label: 'Markdown (.md)' }, { format: 'pdf', label: 'PDF (.pdf)' }, { format: 'docx', label: 'Word DOCX (.docx)' },
    ];
    return [];
  };

  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight.trim()) return <span>{text}</span>;
    
    try {
      const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      return (
        <span>
          {parts.map((part, i) => (
            part.toLowerCase() === highlight.toLowerCase() ? (
              <span key={i} className="bg-brand/20 text-brand dark:text-brand-dark rounded-[2px] font-bold px-0.5">
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            )
          ))}
        </span>
      );
    } catch (e) {
      return <span>{text}</span>;
    }
  };

  const getRelativeComponent = (path: string, baseDir: string) => {
    const p = path.startsWith('/') ? path : '/' + path;
    const base = baseDir.endsWith('/') ? baseDir : baseDir + '/';
    if (!p.startsWith(base)) return null;
    const rel = p.slice(base.length);
    return rel.split('/')[0];
  };

  const filteredFiles = files.filter(f => {
    const query = searchQuery.toLowerCase().trim();
    return query === '' || 
           f.name.toLowerCase().includes(query) || 
           f.path.toLowerCase().includes(query);
  });

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'size') return b.size - a.size;
    if (sortBy === 'date') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    return 0;
  });

  const displayItems = (() => {
    const query = searchQuery.toLowerCase().trim();
    if (query !== '') {
      return sortedFiles.map(f => {
        const isFolder = f.name === '.keep' || f.path.endsWith('/.keep');
        const folderPath = isFolder ? f.path.replace(/\/\.keep$/, '') : f.path;
        const displayName = isFolder ? (folderPath.split('/').pop() || folderPath) : f.name;
        
        return { 
          type: isFolder ? 'folder' as const : 'file' as const, 
          item: f, 
          id: f.id, 
          name: displayName, 
          path: folderPath,
          isFolder
        };
      });
    }

    const result: { type: 'file' | 'folder', item?: VFSItem, id: string, name: string, path: string, isFolder: boolean }[] = [];
    const addedFolders = new Set<string>();

    if (currentDir !== '/') {
      const parts = currentDir.split('/').filter(Boolean);
      parts.pop();
      const parentPath = '/' + parts.join('/');
      result.push({
        type: 'folder',
        id: '__parent_dir__',
        name: '..',
        path: parentPath || '/',
        isFolder: true,
      });
    }

    files.forEach(f => {
      const rel = getRelativeComponent(f.path, currentDir);
      if (!rel) return;

      const fullPath = currentDir === '/' ? `/${rel}` : `${currentDir}/${rel}`;
      
      if (f.path === fullPath) {
        if (f.name !== '.keep') {
          result.push({ 
            type: 'file', 
            item: f, 
            id: f.id, 
            name: f.name, 
            path: f.path,
            isFolder: false
          });
        }
      } else {
        if (!addedFolders.has(rel)) {
          addedFolders.add(rel);
          result.push({ 
            type: 'folder', 
            id: `dir-${fullPath}`, 
            name: rel, 
            path: fullPath,
            isFolder: true
          });
        }
      }
    });
    
    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'date' && a.item && b.item) return b.item.updatedAt - a.item.updatedAt;
      if (sortBy === 'size' && a.item && b.item) return b.item.size - a.item.size;
      return a.name.localeCompare(b.name);
    });
  })();

  const getFileIcon = (file: VFSItem) => {
    if (file.name === '.keep' || file.path.endsWith('/.keep')) {
      return <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />;
    }
    if (file.type.startsWith('image/')) return <Image className="w-4 h-4 text-brand dark:text-brand-dark" />;
    if (file.name.endsWith('.js') || file.name.endsWith('.ts') || file.name.endsWith('.py')) return <FileCode className="w-4 h-4 text-emerald-500" />;
    if (file.name.endsWith('.csv') || file.name.endsWith('.json')) return <FileSpreadsheet className="w-4 h-4 text-amber-500" />;
    if (file.name.endsWith('.md') || file.type.startsWith('text/')) return <FileText className="w-4 h-4 text-blue-500" />;
    return <File className="w-4 h-4 text-gray-500" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <motion.div 
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        className="relative w-full max-w-[1400px] h-full sm:h-[95vh] bg-white dark:bg-[#000000] border-0 sm:border border-gray-200 dark:border-gray-800 rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e); }}
      >
        {/* Dropzone global overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] bg-brand/15 backdrop-blur-[2px] flex flex-col items-center justify-center border-4 border-dashed border-brand/50 m-2 rounded-xl pointer-events-none"
            >
              <div className="bg-white dark:bg-[#000000] p-8 rounded-2xl shadow-2xl flex flex-col items-center border border-brand/20">
                <div className="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mb-4">
                  <Upload className="w-8 h-8 text-brand animate-bounce" />
                </div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">释放文件上传</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">支持拖拽多个文件到 VFS 系统</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-3.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-[#000000]/50">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 bg-brand/10 text-brand rounded-xl shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 truncate">
                虚拟文件系统 (VFS)
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#000000] gap-2.5">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => handleUploadFiles(e.target.files)} 
            multiple 
            className="hidden" 
          />

          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Folder className="w-4 h-4 text-amber-500 shrink-0" />
            <span>当前目录:</span>
            <button
              onClick={() => setCurrentDir('/')}
              className={`px-1.5 py-0.5 rounded font-mono text-[11px] transition-colors cursor-pointer ${
                currentDir === '/' 
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-semibold' 
                  : 'bg-gray-100/60 dark:bg-gray-800/60 text-brand hover:bg-brand/10'
              }`}
              title="切换到根目录"
            >
              /
            </button>
            {currentDir !== '/' && (
              <span className="font-mono text-gray-700 dark:text-gray-200 font-medium truncate max-w-[150px]">
                {currentDir.slice(1)}
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            {(!selectedFile && !isCreatingNew) && (
              <div className="flex items-center gap-2">
                {/* + Dropdown Menu */}
                <div className="relative">
                  <button
                    onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                    className="flex items-center justify-center p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium bg-brand text-white hover:bg-brand/90 rounded-lg transition-colors border border-transparent shadow-xs cursor-pointer gap-1"
                    title="新建或上传文件"
                  >
                    <Plus className="w-4 h-4" />
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isAddMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isAddMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsAddMenuOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          className="absolute left-0 top-full mt-1 w-36 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 py-1 overflow-hidden"
                        >
                          <button
                            onClick={() => {
                              setIsAddMenuOpen(false);
                              fileInputRef.current?.click();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-brand" />
                            <span>上传文件</span>
                          </button>
                          <button
                            onClick={handleStartCreateText}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-500" />
                            <span>新建文本</span>
                          </button>
                          <button
                            onClick={handleCreateFolder}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                          >
                            <Folder className="w-3.5 h-3.5 text-amber-500" />
                            <span>新建文件夹</span>
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {/* Time / Sort Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setIsSortOpen(!isSortOpen)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors border border-transparent focus:border-brand/30 cursor-pointer"
                  >
                    {sortBy === 'date' ? <Clock className="w-3.5 h-3.5" /> : sortBy === 'name' ? <ArrowDownAz className="w-3.5 h-3.5" /> : <ArrowDownWideNarrow className="w-3.5 h-3.5" />}
                    <span>{sortBy === 'date' ? '时间' : sortBy === 'name' ? '名称' : '大小'}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isSortOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isSortOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 py-1 overflow-hidden"
                        >
                          {(['date', 'name', 'size'] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => {
                                setSortBy(mode);
                                setIsSortOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-colors cursor-pointer ${sortBy === mode ? 'bg-brand/5 text-brand font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                            >
                              {mode === 'date' ? <Clock className="w-3 h-3" /> : mode === 'name' ? <ArrowDownAz className="w-3 h-3" /> : <ArrowDownWideNarrow className="w-3 h-3" />}
                              {mode === 'date' ? '修改时间' : mode === 'name' ? '文件名称' : '文件大小'}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                <div
                  className="relative flex-1 sm:min-w-[200px] sm:max-w-[320px]"
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setIsSearchFocused(false);
                    }
                  }}
                >
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="搜索文件名或路径..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand w-full transition-all"
                  />
                </div>
              </div>
            )}
                  <AnimatePresence>
                  </AnimatePresence>
          </div>
        </div>

        {/* Main Body Grid */}
        <div className="flex-1 flex min-h-0 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {/* Left: File List (On mobile, hide when viewing details or creating new file) */}
            {(!selectedFile && !isCreatingNew) ? (
              <motion.div 
                key="list"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full md:w-full shrink-0 flex flex-col overflow-hidden"
              >
              <>
                {sortedFiles.length > 0 && (
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/30">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={toggleSelectAll}
                    className="text-xs text-gray-500 hover:text-brand transition-colors font-medium"
                    title={selectedIds.size === sortedFiles.length ? "取消全选" : "全选"}
                  >
                    {selectedIds.size === sortedFiles.length ? "取消全选" : "全选"}
                  </button>
                  <span className="text-[10px] font-medium text-gray-400">
                    {selectedIds.size > 0 ? `已选 ${selectedIds.size} 项` : "文件列表"}
                  </span>
                </div>
                {selectedIds.size > 0 ? (
                  <div className="flex items-center gap-1">
                    {!isExportDisabled && (
                      <button
                        onClick={handleExportZip}
                        disabled={isExportingZip}
                        className="p-1 text-gray-500 hover:text-brand hover:bg-brand/10 rounded transition-colors disabled:opacity-50"
                        title="导出选中文件为 ZIP 压缩包"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setIsMoving(true)}
                      className="p-1 text-gray-500 hover:text-brand hover:bg-brand/10 rounded transition-colors"
                      title="移动选中的文件"
                    >
                      <Move className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      className="p-1 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="删除选中的文件"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="p-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors"
                      title="退出多选"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-gray-400 select-none hidden sm:inline" title="支持长按或右键进入多选">
                    长按可多选
                  </span>
                )}
              </div>
            )}

            {isMoving && (
              <div className="p-2 border-b border-gray-100 dark:border-gray-800 bg-brand/5">
                <div className="flex items-center gap-1 mb-1.5">
                  <span className="text-[10px] font-medium text-brand">移动到新路径:</span>
                  <button onClick={() => setIsMoving(false)} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
                </div>
                <div className="flex gap-1">
                  <input 
                    type="text"
                    value={newDirPath}
                    onChange={(e) => setNewDirPath(e.target.value)}
                    placeholder="/new/folder"
                    className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-[#1c1c1e] border border-brand/20 rounded focus:outline-none focus:ring-1 focus:ring-brand"
                    onKeyDown={(e) => e.key === 'Enter' && handleBulkMove()}
                  />
                  <button 
                    onClick={handleBulkMove}
                    className="px-2 py-1 bg-brand text-white text-[10px] rounded hover:bg-brand/90"
                  >
                    确认
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {displayItems.length === 0 && searchQuery.trim() === '' ? (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center mb-4">
                    <Folder className="w-10 h-10 text-gray-300 dark:text-gray-700" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">当前目录为空</h3>
                  <p className="text-xs text-gray-500 max-w-[200px]">此目录下暂无文件或子文件夹</p>
                  <button
                    onClick={handleCreateFolder}
                    className="mt-6 px-4 py-2 bg-brand text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all flex items-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    新建文件夹
                  </button>
                </div>
              ) : displayItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center text-gray-400">
                  <Search className="w-12 h-12 mb-2 stroke-1 opacity-50" />
                  <p className="text-xs">未找到匹配 "{searchQuery}" 的结果</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {displayItems.map(item => {
                    const file = item.item;
                    const isSelected = false;
                    const isParentDir = item.id === '__parent_dir__';
                    const isChecked = selectedIds.has(item.id);
                    const isFolder = item.type === 'folder';

                    return (
                      <div
                        key={item.id}
                        onPointerDown={() => !isFolder && !isParentDir && handlePointerDown(item.id)}
                        onPointerUp={handlePointerUpOrLeave}
                        onPointerLeave={handlePointerUpOrLeave}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!isFolder && !isParentDir) toggleSelect(item.id);
                        }}
                        onClick={(e) => {
                          if (isMoving && isFolder && !isParentDir) {
                            setNewDirPath(item.path);
                            return;
                          }
                          
                          if (isParentDir) {
                            setCurrentDir(item.path);
                            return;
                          }

                          if (!isFolder && (e.metaKey || e.ctrlKey || e.shiftKey || selectedIds.size > 0)) {
                            toggleSelect(item.id);
                          } else {
                            if (isFolder) {
                              setCurrentDir(item.path);
                              return;
                            }
                            if (file) {
                              setSelectedFile(file);
                              setExecutionResult(null);
                              setIsCreatingNew(false);
                              setIsEditing(false);
                              setIsModified(false);
                              setSelectedFileTab('preview');
                              setEditContent(file.content);
                              setEditPath(file.path);
                            }
                          }
                        }}
                        className={`p-3 flex items-start gap-2.5 cursor-pointer transition-all duration-150 relative group select-none ${
                          isParentDir
                            ? 'hover:bg-brand/5 dark:hover:bg-brand/10 border-b border-gray-100 dark:border-gray-800/50'
                            : isChecked
                            ? 'bg-brand/15 dark:bg-brand/25 border-l-4 border-brand shadow-2xs'
                            : isSelected
                            ? 'bg-gray-100 dark:bg-gray-800/80 border-l-2 border-brand'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg mt-0.5 shrink-0 ${isParentDir ? 'bg-brand/10' : 'bg-gray-100 dark:bg-gray-800'}`}>
                          {isParentDir ? <ArrowLeft className="w-4 h-4 text-brand" /> : isFolder ? <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" /> : file ? getFileIcon(file) : <File className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className={`text-xs font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-1 ${isParentDir ? 'text-brand dark:text-brand-dark' : ''}`}>
                              {isParentDir ? '返回上级目录' : (<>
                                {isFolder && <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1 py-0.2 rounded font-normal shrink-0">文件夹</span>}
                                {renderHighlightedText(item.name, searchQuery)}
                              </>)}
                            </h4>
                            {!isParentDir && <span className="text-[10px] text-gray-400 shrink-0">{isFolder ? '目录' : file ? formatSize(file.size) : ''}</span>}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">
                            {isParentDir ? item.path : renderHighlightedText(item.path, searchQuery)}
                          </p>
                          {!isParentDir && file && (
                            <p className="text-[10px] text-gray-400 mt-1">
                              {new Date(file.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                        {!isParentDir && !isFolder && (
                          <div className="relative shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (getExportFormats(file!).length > 0) {
                                  setExportMenuFile(exportMenuFile?.id === item.id ? null : file!);
                                } else {
                                  handleDownloadFile(file!);
                                }
                              }}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                              title="导出为..."
                            >
                              <Download className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
                            </button>
                            {exportMenuFile?.id === item.id && (
                              <div ref={exportMenuRef} className="absolute right-0 top-6 z-50 w-44 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 overflow-hidden">
                                {getExportFormats(file!).map(f => (
                                  <button
                                    key={f.format}
                                    onClick={(e) => { e.stopPropagation(); exportFileAs(file!, f.format as any); }}
                                    className="w-full text-left px-3 py-2 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-brand/10 hover:text-brand transition-colors cursor-pointer"
                                  >
                                    导出为 {f.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {!isParentDir && isChecked && (
                          <div className="w-2 h-2 rounded-full bg-brand shrink-0 self-center" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        </motion.div>
        ) : (
          <motion.div 
            key="detail"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`w-full flex-1 flex-col overflow-y-auto bg-gray-50/30 dark:bg-[#000000]/30 p-3 sm:p-6 flex`}
          >
            {isCreatingNew ? (
              <div className="flex flex-col h-full gap-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-800">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-brand" />
                    新建 VFS 文本文件
                  </h3>
                  <button
                    onClick={() => setIsCreatingNew(false)}
                    className="md:hidden flex items-center gap-1 text-xs text-brand font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>返回列表</span>
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">虚拟路径 (Path)</label>
                  <input
                    type="text"
                    placeholder="例如 /notes/summary.md"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div className="flex-1 flex flex-col space-y-1 min-h-[200px]">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">文件内容</label>
                  <textarea
                    placeholder="在此输入文本或 Markdown 内容..."
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                    className="flex-1 w-full p-3 text-xs font-mono bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsCreatingNew(false)}
                    className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleCreateNewFile}
                    className="px-4 py-1.5 text-xs font-medium bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors shadow-xs"
                  >
                    保存文件
                  </button>
                </div>
              </div>
            ) : selectedFile ? (
              <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden relative">
                {/* Top Bar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1e] shrink-0">
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-brand" />
                    <span>返回</span>
                  </button>

                  <div className="flex-1 min-w-0 px-2">
                    <p className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate" title={selectedFile.path}>
                      {selectedFile.path}
                    </p>
                  </div>

                  {!selectedFile.isBase64 && (
                    <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700 shrink-0">
                      <button
                        onClick={() => {
                          setSelectedFileTab('preview');
                          setIsEditing(false);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                          selectedFileTab === 'preview'
                            ? 'bg-white dark:bg-gray-700 text-brand shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        预览
                      </button>
                      <button
                        onClick={() => {
                          setSelectedFileTab('edit');
                          setIsEditing(true);
                          setEditContent(selectedFile.content);
                          setEditPath(selectedFile.path);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                          selectedFileTab === 'edit'
                            ? 'bg-white dark:bg-gray-700 text-brand shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        编辑
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setIsFileSearchOpen(!isFileSearchOpen)}
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                      isFileSearchOpen
                        ? 'bg-brand/10 text-brand'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    title="文件内搜索"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>

                  {isEditing && isModified && (
                    <button
                      onClick={handleSaveEdit}
                      className="flex items-center gap-1 px-2.5 py-1 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand/90 transition-all shrink-0"
                    >
                      <Save className="w-3 h-3" />
                      <span>保存</span>
                    </button>
                  )}
                </div>

                {/* In-file search bar */}
                {isFileSearchOpen && !selectedFile.isBase64 && (
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-brand/5 shrink-0">
                    <Search className="w-3.5 h-3.5 text-brand shrink-0" />
                    <input
                      ref={fileSearchInputRef}
                      type="text"
                      placeholder="在文件中搜索..."
                      value={fileSearchQuery}
                      onChange={(e) => setFileSearchQuery(e.target.value)}
                      className="flex-1 px-2 py-1 text-xs bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        setIsFileSearchOpen(false);
                        setFileSearchQuery('');
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex-1 p-0 overflow-auto relative group" ref={contentPreviewRef}>
                  {selectedFileTab === 'preview' ? (
                    selectedFile.isBase64 ? (
                      selectedFile.type.startsWith('image/') ? (
                        <div className="flex items-center justify-center h-full min-h-[180px] p-8">
                          <img src={selectedFile.content} alt={selectedFile.name} className="max-h-full max-w-full rounded-lg border border-gray-200 dark:border-gray-700 object-contain shadow-sm" />
                        </div>
                      ) : (selectedFile.name.endsWith('.epub') || selectedFile.type === 'application/epub+zip') ? (
                        <EpubViewer fileContent={selectedFile.content} />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-gray-400 text-xs">
                          <File className="w-10 h-10 mb-2 opacity-50" />
                          <p>二进制文件无法进行纯文本预览</p>
                        </div>
                      )
                    ) : (selectedFile.name.endsWith('.csv') || selectedFile.type.includes('csv')) ? (
                      <div className="p-4">{renderCSVTable(selectedFile.content)}</div>
                    ) : (selectedFile.name.endsWith('.md') || selectedFile.type.includes('markdown')) ? (
                      <div className="markdown-body prose prose-sm dark:prose-invert max-w-none p-6 overflow-auto">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                          {selectedFile.content}
                        </ReactMarkdown>
                      </div>
                    ) : (selectedFile.name.endsWith('.html') || selectedFile.type.includes('html')) ? (
                      <div className="w-full h-full min-h-[400px] bg-white rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                        <iframe
                          srcDoc={selectedFile.content}
                          title="HTML Preview"
                          className="w-full h-full border-none bg-white"
                          sandbox="allow-scripts"
                        />
                      </div>
                    ) : (
                      <div className="h-full">
                        <UnifiedCodeEditor
                          value={selectedFile.content}
                          onChange={() => {}}
                          filePath={selectedFile.path}
                          fileName={selectedFile.name}
                          readOnly={true}
                        />
                      </div>
                    )
                  ) : (
                    (selectedFile.isBase64 && !selectedFile.name.endsWith('.epub') && selectedFile.type !== 'application/epub+zip') ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-gray-400 text-xs">
                        <File className="w-10 h-10 mb-2 opacity-50" />
                        <p>该二进制文件无法进行纯文本编辑</p>
                      </div>
                    ) : (selectedFile.name.endsWith('.epub') || selectedFile.type === 'application/epub+zip') ? (
                      <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-500 bg-gray-50 dark:bg-gray-900/50">
                        <BookOpen className="w-12 h-12 mb-4 mx-auto opacity-50" />
                        <p className="font-medium text-gray-700 dark:text-gray-200 mb-2">EPUB 电子书文件</p>
                        <p className="text-sm max-w-md mx-auto">EPUB 是一种压缩归档格式，无法直接作为纯文本编辑。</p>
                        <div className="mt-6 text-xs bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 max-w-sm mx-auto shadow-sm">
                          <p className="font-bold text-gray-700 dark:text-gray-300 mb-2">如何编辑？</p>
                          <ul className="text-left list-disc pl-4 space-y-1">
                            <li>在对话中让 AI 助手使用 <code>edit_epub</code> 工具重新生成。</li>
                            <li>点击左侧工具栏的下载按钮，在本地专业阅读器中编辑。</li>
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <UnifiedCodeEditor
                        value={editContent}
                        onChange={(val) => {
                          setEditContent(val);
                          setIsModified(true);
                        }}
                        filePath={selectedFile.path}
                        fileName={selectedFile.name}
                      />
                    )
                  )}

                  {executionResult && (
                    <div className="absolute bottom-4 left-4 right-4 max-h-[50%] bg-[#1c1c1e] border border-gray-700 rounded-lg shadow-2xl flex flex-col overflow-hidden z-20">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          <Terminal className="w-3 h-3" />
                          <span>执行输出</span>
                        </div>
                        <button 
                          onClick={() => setExecutionResult(null)}
                          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="p-3 overflow-auto font-mono text-[11px] leading-relaxed">
                        <pre className={executionResult.error ? 'text-red-400' : 'text-green-400'}>
                          {executionResult.output}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-center text-gray-400 p-4">
                <HardDrive className="w-12 h-12 mb-3 stroke-1 text-gray-300 dark:text-gray-700" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">选择一个 VFS 文件以预览或编辑</p>
                <p className="text-xs text-gray-400 mt-1">或者点击“上传到 VFS”上传新文件（不会注入对话 Prompt，省 Token）</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
      </motion.div>
    </div>
  );
};

