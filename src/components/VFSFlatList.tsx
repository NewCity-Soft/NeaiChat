import React, { useState, useRef } from 'react';
import {
  Folder,
  FileCode,
  FileText,
  FileSpreadsheet,
  Image,
  File,
  MoreVertical,
  Download,
  Trash2,
  Edit2,
  FolderInput,
  Search,
  ArrowUp,
  Clock,
  ArrowDownAz,
  ArrowDownWideNarrow,
} from 'lucide-react';
import { VFSItem } from '../utils/vfs';
import { customConfirm } from '../services/dialogService';

interface VFSFlatListProps {
  files: VFSItem[];
  activeFilePath?: string;
  onSelectFile: (file: VFSItem) => void;
  onDownloadFile?: (file: VFSItem) => void;
  showToast?: (message: string, type?: 'info' | 'warning' | 'error' | 'success') => void;
}

export const VFSFlatList: React.FC<VFSFlatListProps> = ({
  files,
  activeFilePath,
  onSelectFile,
  onDownloadFile,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ file: VFSItem; x: number; y: number } | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const filteredFiles = files.filter(f => {
    const q = searchQuery.toLowerCase().trim();
    return !q || f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
  });

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortBy === 'size') cmp = a.size - b.size;
    else cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    return sortAsc ? cmp : -cmp;
  });

  const getFileIcon = (file: VFSItem) => {
    if (file.type?.startsWith('image/') || file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.svg')) {
      return <Image className="w-4 h-4 text-blue-500 shrink-0" />;
    }
    if (file.name.endsWith('.js') || file.name.endsWith('.ts') || file.name.endsWith('.jsx') || file.name.endsWith('.tsx') || file.name.endsWith('.html') || file.name.endsWith('.css')) {
      return <FileCode className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    if (file.name.endsWith('.json') || file.name.endsWith('.csv')) {
      return <FileSpreadsheet className="w-4 h-4 text-amber-500 shrink-0" />;
    }
    if (file.name.endsWith('.md') || file.name.endsWith('.txt') || file.type?.startsWith('text/')) {
      return <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />;
    }
    return <File className="w-4 h-4 text-gray-400 shrink-0" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFolderColor = (path: string) => {
    if (!path || path === '/') return null;
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const colors: Record<string, string> = {
      src: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
      public: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
      assets: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      electron: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
      scripts: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
      notes: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
      images: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
    };
    return colors[parts[0]] || 'bg-gray-100 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400';
  };

  const handleLongPress = (file: VFSItem, e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => {
      setActionMenu({ file, x: touch.clientX, y: touch.clientY });
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
    }, 450);
  };

  const handleTouchStart = (file: VFSItem, e: React.TouchEvent) => {
    handleLongPress(file, e);
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: VFSItem) => {
    e.preventDefault();
    setActionMenu({ file, x: e.clientX, y: e.clientY });
  };

  const handleDownload = (file: VFSItem) => {
    setActionMenu(null);
    if (onDownloadFile) {
      onDownloadFile(file);
      return;
    }
    const blob = new Blob([file.content], { type: file.type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClick = (file: VFSItem) => {
    if (actionMenu) return;
    onSelectFile(file);
  };

  // Build folder path chips
  const getPathChips = (path: string) => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    return parts.map((part, i) => ({
      name: part,
      color: getFolderColor('/' + parts.slice(0, i + 1).join('/')),
    }));
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#000000]">
      {/* Search & Sort Bar */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索文件名或路径..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand placeholder:text-gray-400"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[10px] text-gray-400 shrink-0 font-medium">共 {sortedFiles.length} 个文件</span>
          {(['date', 'name', 'size'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                if (sortBy === mode) setSortAsc(!sortAsc);
                else { setSortBy(mode); setSortAsc(false); }
              }}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg font-medium transition-all shrink-0 ${
                sortBy === mode
                  ? 'bg-brand/10 text-brand dark:text-brand-dark'
                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {mode === 'date' ? <Clock className="w-3 h-3" /> : mode === 'name' ? <ArrowDownAz className="w-3 h-3" /> : <ArrowDownWideNarrow className="w-3 h-3" />}
              {mode === 'date' ? '时间' : mode === 'name' ? '名称' : '大小'}
              {sortBy === mode && (sortAsc ? <ArrowUp className="w-2.5 h-2.5" /> : null)}
            </button>
          ))}
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        {sortedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Folder className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {searchQuery ? '未找到匹配结果' : 'VFS 暂无文件'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
              {searchQuery ? '尝试其他搜索词' : '点击右上角 + 创建文件或上传'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {sortedFiles.map((file) => {
              const isActive = file.path === activeFilePath;
              const chips = getPathChips(file.path);

              return (
                <div
                  key={file.id}
                  onTouchStart={(e) => handleTouchStart(file, e)}
                  onTouchEnd={handleTouchEnd}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  onClick={() => handleClick(file)}
                  className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-all active:scale-[0.99] ${
                    isActive
                      ? 'bg-brand/8 dark:bg-brand-dark/12 border-l-3 border-brand pl-2'
                      : 'hover:bg-gray-50/80 dark:hover:bg-white/3'
                  }`}
                >
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800/80 flex items-center justify-center shrink-0">
                    {getFileIcon(file)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* File name */}
                    <p className={`text-xs font-semibold truncate ${isActive ? 'text-brand dark:text-brand-dark' : 'text-gray-800 dark:text-gray-200'}`}>
                      {file.name}
                    </p>

                    {/* Path chips */}
                    {chips && chips.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {chips.map((chip, i) => (
                          <span
                            key={i}
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium ${chip.color || 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                          >
                            {chip.name}
                          </span>
                        ))}
                        <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono truncate">
                          {file.name}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right side: size + time + actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">
                        {formatSize(file.size)}
                      </p>
                      <p className="text-[10px] text-gray-300 dark:text-gray-700">
                        {new Date(file.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActionMenu({ file, x: e.clientX ?? 100, y: e.clientY ?? 100 }); }}
                      className="p-1.5 text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Menu */}
      {actionMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setActionMenu(null)} />
          <div
            className="fixed z-50 w-48 bg-white/95 dark:bg-[#1f1f23]/95 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/80 rounded-xl shadow-2xl py-1.5 text-xs text-gray-700 dark:text-gray-200 overflow-hidden"
            style={{
              top: Math.min(actionMenu.y, window.innerHeight - 200),
              left: Math.min(actionMenu.x, window.innerWidth - 200),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 font-semibold truncate text-gray-900 dark:text-white flex items-center gap-2 bg-gray-50/50 dark:bg-white/5">
              {getFileIcon(actionMenu.file)}
              <span className="truncate text-[11px]">{actionMenu.file.name}</span>
            </div>

            <button
              type="button"
              onClick={() => { onSelectFile(actionMenu.file); setActionMenu(null); }}
              className="w-full text-left px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5 text-brand shrink-0" />
              <span>打开 / 编辑</span>
            </button>

            {!actionMenu.file.isBase64 && (
              <button
                type="button"
                onClick={() => { handleDownload(actionMenu.file); }}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>下载文件</span>
              </button>
            )}

            <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

            <button
              type="button"
              onClick={async () => {
                setActionMenu(null);
                if (await customConfirm(`确定要删除文件 "${actionMenu.file.name}" 吗？`, { title: '确认删除' })) {
                  showToast?.(`已删除 ${actionMenu.file.name}`, 'info');
                }
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center gap-2.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>删除</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
