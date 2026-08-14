import React, { useState, useMemo, useRef } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  FileText, 
  FileSpreadsheet, 
  Image, 
  File, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  FolderPlus, 
  FilePlus, 
  HardDrive,
  Check,
  X,
  MoreVertical,
  Edit2,
  FolderInput,
  Download,
  ArrowLeft
} from 'lucide-react';
import { VFSItem } from '../utils/vfs';
import { customConfirm } from '../services/dialogService';

export interface VFSTreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  children: VFSTreeNode[];
  fileItem?: VFSItem;
}

interface VFSTreeExplorerProps {
  files: VFSItem[];
  activeFilePath?: string;
  onSelectFile: (file: VFSItem) => void;
  onCreateFile: (folderPath: string, fileName: string) => void;
  onCreateFolder: (parentFolderPath: string, folderName: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onMoveFile?: (sourcePath: string, targetFolderPath: string) => void;
  onRenameItem?: (oldPath: string, newName: string) => void;
  onDownloadFile?: (file: VFSItem) => void;
  onBack?: () => void;
  className?: string;
  hideBreadcrumb?: boolean;
}

export const VFSTreeExplorer: React.FC<VFSTreeExplorerProps> = ({
  files,
  activeFilePath,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onRenameItem,
  onDownloadFile,
  onBack,
  className = '',
  hideBreadcrumb = false,
}) => {
  // Expanded folders set
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']));
  // Selected folder for creation focus
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>('/');
  // Inline creation states
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [creatingParentPath, setCreatingParentPath] = useState<string>('/');
  const [newItemName, setNewItemName] = useState<string>('');

  // Drag & Drop & Hover State
  const [dragSourcePath, setDragSourcePath] = useState<string | null>(null);
  const [dragHoverFolderPath, setDragHoverFolderPath] = useState<string | null>(null);

  // Context Menu / Action Menu State
  const [actionMenuNode, setActionMenuNode] = useState<{ node: VFSTreeNode; x: number; y: number } | null>(null);

  // Rename Dialog State
  const [renamingNode, setRenamingNode] = useState<VFSTreeNode | null>(null);
  const [renamingValue, setRenamingValue] = useState<string>('');

  // Move To Folder Dialog State
  const [moveNode, setMoveNode] = useState<VFSTreeNode | null>(null);
  const [targetMoveFolder, setTargetMoveFolder] = useState<string>('/');

  // Touch Long Press Refs
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Build tree data structure from flat VFS items
  const treeData = useMemo(() => {
    const root: VFSTreeNode = {
      id: 'root',
      name: '根目录 (/)',
      path: '/',
      isFolder: true,
      children: [],
    };

    const folderMap = new Map<string, VFSTreeNode>();
    folderMap.set('/', root);

    const ensureFolder = (dirPath: string): VFSTreeNode => {
      if (folderMap.has(dirPath)) return folderMap.get(dirPath)!;

      const parts = dirPath.split('/').filter(Boolean);
      let currentPath = '';
      let parentNode = root;

      for (const part of parts) {
        currentPath += '/' + part;
        if (!folderMap.has(currentPath)) {
          const folderNode: VFSTreeNode = {
            id: `dir-${currentPath}`,
            name: part,
            path: currentPath,
            isFolder: true,
            children: [],
          };
          parentNode.children.push(folderNode);
          folderMap.set(currentPath, folderNode);
        }
        parentNode = folderMap.get(currentPath)!;
      }

      return parentNode;
    };

    files.forEach((file) => {
      const parts = file.path.split('/').filter(Boolean);
      if (parts.length === 0) return;

      const fileName = parts.pop()!;
      const dirPath = '/' + parts.join('/');

      const parentNode = ensureFolder(dirPath === '/' ? '/' : dirPath);

      // Skip .keep marker files from rendering
      if (fileName === '.keep') return;

      parentNode.children.push({
        id: file.id,
        name: fileName,
        path: file.path,
        isFolder: false,
        children: [],
        fileItem: file,
      });
    });

    const sortNodes = (node: VFSTreeNode) => {
      node.children.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
      });
      node.children.forEach(sortNodes);
    };

    sortNodes(root);
    return root;
  }, [files]);

  // All folders list for Move modal
  const allFoldersList = useMemo(() => {
    const folders: string[] = ['/'];
    const traverse = (node: VFSTreeNode) => {
      if (node.isFolder && node.path !== '/') {
        folders.push(node.path);
      }
      node.children.forEach(traverse);
    };
    traverse(treeData);
    return folders;
  }, [treeData]);

  const toggleFolder = (folderPath: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
    setSelectedFolderPath(folderPath);
  };

  const handleStartCreate = (parentPath: string, type: 'file' | 'folder', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCreatingParentPath(parentPath);
    setCreatingType(type);
    setNewItemName('');
    setExpandedFolders((prev) => new Set(prev).add(parentPath));
  };

  const handleConfirmCreate = () => {
    const trimmed = newItemName.trim();
    if (!trimmed) {
      setCreatingType(null);
      return;
    }

    if (creatingType === 'file') {
      onCreateFile(creatingParentPath, trimmed);
    } else if (creatingType === 'folder') {
      onCreateFolder(creatingParentPath, trimmed);
    }

    setCreatingType(null);
    setNewItemName('');
  };

  // Trigger Action Menu (3-dots or long-press)
  const openActionMenu = (node: VFSTreeNode, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    let x = 100;
    let y = 100;

    if ('clientX' in e) {
      x = e.clientX;
      y = e.clientY;
    } else if (e.touches && e.touches[0]) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    }

    setActionMenuNode({ node, x, y });
  };

  // Touch Long-Press Handling
  const handleTouchStart = (node: VFSTreeNode, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);

    touchTimerRef.current = setTimeout(() => {
      openActionMenu(node, e);
    }, 500);
  };

  const handleTouchMove = (node: VFSTreeNode, e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);

    // Cancel long press if moved significantly
    if (dx > 10 || dy > 10) {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
    }

    // Touch Dragging Folder Highlight Detection
    if (!node.isFolder && onMoveFile) {
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      const folderElem = element?.closest('[data-folder-path]');
      if (folderElem) {
        const folderPath = folderElem.getAttribute('data-folder-path');
        if (folderPath && folderPath !== node.path) {
          setDragHoverFolderPath(folderPath);
          setDragSourcePath(node.path);
        }
      }
    }
  };

  const handleTouchEnd = (node: VFSTreeNode) => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }

    // Drop if dragging over target folder
    if (dragSourcePath && dragHoverFolderPath && onMoveFile) {
      onMoveFile(dragSourcePath, dragHoverFolderPath);
      setDragSourcePath(null);
      setDragHoverFolderPath(null);
    }
  };

  // HTML5 Drag & Drop handlers
  const handleDragStart = (node: VFSTreeNode, e: React.DragEvent) => {
    e.stopPropagation();
    setDragSourcePath(node.path);
    e.dataTransfer.setData('text/vfs-path', node.path);
  };

  const handleDragOverFolder = (folderPath: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragSourcePath && dragSourcePath !== folderPath) {
      setDragHoverFolderPath(folderPath);
    }
  };

  const handleDropFolder = (folderPath: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourcePath = e.dataTransfer.getData('text/vfs-path') || dragSourcePath;
    if (sourcePath && sourcePath !== folderPath && onMoveFile) {
      onMoveFile(sourcePath, folderPath);
    }
    setDragSourcePath(null);
    setDragHoverFolderPath(null);
  };

  // Default File Download helper
  const handleDownload = (file: VFSItem) => {
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

  // Rename Confirmation
  const handleConfirmRename = () => {
    if (!renamingNode) return;
    const trimmed = renamingValue.trim();
    if (trimmed && trimmed !== renamingNode.name && onRenameItem) {
      onRenameItem(renamingNode.path, trimmed);
    }
    setRenamingNode(null);
    setRenamingValue('');
  };

  // Move Confirmation
  const handleConfirmMove = () => {
    if (!moveNode || !onMoveFile) return;
    onMoveFile(moveNode.path, targetMoveFolder);
    setMoveNode(null);
  };

  const getFileIcon = (fileName: string, type?: string) => {
    if (fileName.endsWith('.js') || fileName.endsWith('.ts') || fileName.endsWith('.jsx') || fileName.endsWith('.tsx') || fileName.endsWith('.html') || fileName.endsWith('.css')) {
      return <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    }
    if (fileName.endsWith('.json') || fileName.endsWith('.csv')) {
      return <FileSpreadsheet className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />;
    }
    if (type?.startsWith('image/') || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.svg')) {
      return <Image className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />;
    }
    if (fileName.endsWith('.md') || fileName.endsWith('.txt')) {
      return <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />;
    }
    return <File className="w-4 h-4 text-gray-500 shrink-0" />;
  };

  // Render node recursively
  const renderNode = (node: VFSTreeNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isRoot = node.path === '/';
    const isSelectedFolder = selectedFolderPath === node.path;
    const isDragHover = dragHoverFolderPath === node.path;

    if (node.isFolder) {
      return (
        <div key={node.path} className="select-none" data-folder-path={node.path}>
          {/* Folder row */}
          {!isRoot && (
            <div
              onClick={(e) => toggleFolder(node.path, e)}
              onContextMenu={(e) => openActionMenu(node, e)}
              onDragOver={(e) => handleDragOverFolder(node.path, e)}
              onDragLeave={() => setDragHoverFolderPath(null)}
              onDrop={(e) => handleDropFolder(node.path, e)}
              style={{ paddingLeft: `${Math.max(8, level * 12)}px` }}
              className={`group flex items-center justify-between pr-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                isDragHover
                  ? 'bg-amber-100 dark:bg-amber-900/40 border-2 border-dashed border-amber-500 scale-[1.01]'
                  : isSelectedFolder
                  ? 'bg-gray-200/70 dark:bg-gray-800/80 text-gray-900 dark:text-white font-semibold'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0 pr-1">
                <span className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </span>
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <span className="truncate">{node.name}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-0.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => handleStartCreate(node.path, 'file', e)}
                  title="新建文件"
                  className="p-1 text-gray-400 hover:text-brand dark:hover:text-brand-dark rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleStartCreate(node.path, 'folder', e)}
                  title="新建子文件夹"
                  className="p-1 text-gray-400 hover:text-amber-500 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => openActionMenu(node, e)}
                  title="文件夹选项"
                  className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Folder children */}
          {(isRoot || isExpanded) && (
            <div className="space-y-0.5 mt-0.5">
              {/* Inline input if creating in this folder */}
              {creatingType && creatingParentPath === node.path && (
                <div
                  style={{ paddingLeft: `${(level + 1) * 12 + 12}px` }}
                  className="flex items-center gap-1 py-1 pr-2 my-0.5"
                >
                  {creatingType === 'folder' ? (
                    <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <File className="w-3.5 h-3.5 text-brand shrink-0" />
                  )}
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder={creatingType === 'folder' ? '文件夹名称' : '文件名 (如 app.js)'}
                    className="flex-1 px-2 py-0.5 text-xs bg-white dark:bg-[#1c1c1e] border border-brand rounded focus:outline-none font-mono"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmCreate();
                      if (e.key === 'Escape') setCreatingType(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleConfirmCreate}
                    className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatingType(null)}
                    className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {node.children.map((child) => renderNode(child, isRoot ? 0 : level + 1))}

              {node.children.length === 0 && !creatingType && !isRoot && (
                <div
                  style={{ paddingLeft: `${(level + 1) * 12 + 20}px` }}
                  className="text-[11px] text-gray-400 dark:text-gray-600 py-1 italic"
                >
                  (空文件夹)
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // Render File Row
    const isActive = node.path === activeFilePath;

    return (
      <div
        key={node.path}
        draggable={true}
        onDragStart={(e) => handleDragStart(node, e)}
        onTouchStart={(e) => handleTouchStart(node, e)}
        onTouchMove={(e) => handleTouchMove(node, e)}
        onTouchEnd={() => handleTouchEnd(node)}
        onClick={() => node.fileItem && onSelectFile(node.fileItem)}
        onContextMenu={(e) => openActionMenu(node, e)}
        style={{ paddingLeft: `${Math.max(12, level * 12 + 8)}px` }}
        className={`group flex items-center justify-between pr-1 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition-all select-none ${
          isActive
            ? 'bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark font-semibold border-l-2 border-brand'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 pr-1">
          {getFileIcon(node.name, node.fileItem?.type)}
          <span className="truncate">{node.name}</span>
        </div>

        {/* Action Menu Trigger Button (...) */}
        <button
          type="button"
          onClick={(e) => openActionMenu(node, e)}
          title="文件选项"
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  // Breadcrumbs for selected folder
  const folderBreadcrumbs = selectedFolderPath.split('/').filter(Boolean);

  return (
    <div className={`flex flex-col h-full bg-gray-50/50 dark:bg-[#141416]/50 border-r border-gray-200/80 dark:border-gray-800/80 ${className}`}>
      {/* Directory Breadcrumbs Bar */}
      {!hideBreadcrumb && (
        <div className="px-3 py-1.5 bg-gray-100/60 dark:bg-gray-900/40 border-b border-gray-200/60 dark:border-gray-800/60 flex items-center gap-1 overflow-x-auto text-[11px] text-gray-500 no-scrollbar font-mono">
          <button
            type="button"
            onClick={() => setSelectedFolderPath('/')}
            className={`hover:text-brand ${selectedFolderPath === '/' ? 'font-bold text-gray-800 dark:text-gray-200' : ''}`}
          >
            /
          </button>
          {folderBreadcrumbs.map((part, idx) => {
            const path = '/' + folderBreadcrumbs.slice(0, idx + 1).join('/');
            const isLast = idx === folderBreadcrumbs.length - 1;
            return (
              <React.Fragment key={path}>
                <span>/</span>
                <button
                  type="button"
                  onClick={() => setSelectedFolderPath(path)}
                  className={`hover:text-brand truncate max-w-[80px] ${isLast ? 'font-bold text-gray-800 dark:text-gray-200' : ''}`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {files.length === 0 && !creatingType ? (
          <div className="text-center py-12 px-4 space-y-3">
            <Folder className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 stroke-[1.5]" />
            <div className="text-xs text-gray-500 dark:text-gray-400">
              VFS 暂无文件
            </div>
            <div className="flex justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={(e) => handleStartCreate('/', 'file', e)}
                className="px-2.5 py-1 text-xs bg-brand text-white rounded-lg font-medium hover:opacity-90"
              >
                新建文件
              </button>
              <button
                type="button"
                onClick={(e) => handleStartCreate('/', 'folder', e)}
                className="px-2.5 py-1 text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-700"
              >
                新建文件夹
              </button>
            </div>
          </div>
        ) : (
          renderNode(treeData)
        )}
      </div>

      {/* Popover Action Menu */}
      {actionMenuNode && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setActionMenuNode(null)}
          />
          <div
            className="fixed z-50 w-52 bg-white/95 dark:bg-[#1f1f23]/95 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/80 rounded-xl shadow-2xl py-1.5 text-xs text-gray-700 dark:text-gray-200 space-y-0.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={{
              top: Math.min(actionMenuNode.y, window.innerHeight - 240),
              left: Math.min(actionMenuNode.x, window.innerWidth - 220),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 font-semibold truncate text-gray-900 dark:text-white flex items-center gap-2 bg-gray-50/50 dark:bg-white/5">
              {actionMenuNode.node.isFolder ? <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" /> : <FileCode className="w-3.5 h-3.5 text-brand shrink-0" />}
              <span className="truncate">{actionMenuNode.node.name}</span>
            </div>

            <div className="p-1 space-y-0.5">
              {/* Rename */}
              <button
                type="button"
                onClick={() => {
                  setRenamingNode(actionMenuNode.node);
                  setRenamingValue(actionMenuNode.node.name);
                  setActionMenuNode(null);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <span>重命名</span>
              </button>

              {/* Move to folder */}
              <button
                type="button"
                onClick={() => {
                  setMoveNode(actionMenuNode.node);
                  setTargetMoveFolder('/');
                  setActionMenuNode(null);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <FolderInput className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>移动到文件夹...</span>
              </button>

              {/* Download file */}
              {!actionMenuNode.node.isFolder && actionMenuNode.node.fileItem && (
                <button
                  type="button"
                  onClick={() => {
                    handleDownload(actionMenuNode.node.fileItem!);
                    setActionMenuNode(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>下载文件</span>
                </button>
              )}
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

            <div className="p-1">
              {/* Delete */}
              <button
                type="button"
                onClick={async () => {
                  const node = actionMenuNode.node;
                  setActionMenuNode(null);
                  if (await customConfirm(`确定要删除 ${node.isFolder ? '文件夹' : '文件'} "${node.name}" 吗？`, { title: '确认删除' })) {
                    if (node.isFolder) onDeleteFolder(node.path);
                    else onDeleteFile(node.path);
                  }
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>删除</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Rename Modal */}
      {renamingNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-[#1a1a1d] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-brand" />
              重命名 "{renamingNode.name}"
            </h3>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">新名称</label>
              <input
                type="text"
                value={renamingValue}
                onChange={(e) => setRenamingValue(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-[#121214] border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand font-mono"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename()}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenamingNode(null)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmRename}
                className="px-4 py-1.5 text-xs bg-brand text-white font-medium rounded-lg hover:opacity-90 shadow-xs"
              >
                保存重命名
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move To Folder Modal */}
      {moveNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-[#1a1a1d] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FolderInput className="w-4 h-4 text-amber-500" />
              移动 "{moveNode.name}" 到目标目录
            </h3>

            <div className="space-y-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 block">选择目标文件夹</label>
              <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl p-1 space-y-1 bg-gray-50/50 dark:bg-[#121214]/50">
                {allFoldersList.map((folderPath) => {
                  if (moveNode.isFolder && (folderPath === moveNode.path || folderPath.startsWith(moveNode.path + '/'))) {
                    return null; // Cannot move folder inside itself
                  }
                  const isSelected = targetMoveFolder === folderPath;
                  return (
                    <button
                      key={folderPath}
                      type="button"
                      onClick={() => setTargetMoveFolder(folderPath)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 transition-colors ${
                        isSelected
                          ? 'bg-amber-500 text-white font-bold'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                      }`}
                    >
                      <Folder className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-amber-500'}`} />
                      <span>{folderPath === '/' ? '/ (根目录)' : folderPath}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMoveNode(null)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmMove}
                className="px-4 py-1.5 text-xs bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 shadow-xs"
              >
                确认移动
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
