import { useEffect, useState } from 'react';
import { Download, Paperclip, Volume2, Play, Image as ImageIcon, File as FileIcon, Loader2 } from 'lucide-react';
import { Attachment } from '../types';
import { downloadWithAIGCMetadata } from '../utils/aigc-metadata';
import { cacheMedia } from '../utils/mediaCache';

export const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const downloadFile = async (at: Attachment) => {
  await downloadWithAIGCMetadata(at.url, at.name, at.type || 'application/octet-stream');
};

export const FileCard = ({ at, isSmall = false, isUser = false, isExportDisabled = false, onReference, onEnlarge }: { at: Attachment; isSmall?: boolean, isUser?: boolean, isExportDisabled?: boolean, onReference?: (at: Attachment) => void, onEnlarge?: (url: string) => void }) => {
  const isImage = at.type.startsWith('image/');
  const isAudio = at.type.startsWith('audio/');
  const isVideo = at.type.startsWith('video/');
  const [displayUrl, setDisplayUrl] = useState(at.url);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadFile(at);
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    let active = true;
    if ((isImage || isVideo || isAudio) && at.url && at.url.startsWith('http')) {
      cacheMedia(at.url, at.type).then((cached) => {
        if (active && cached) {
          setDisplayUrl(cached);
        }
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [at.url, at.type, isImage, isVideo, isAudio]);

  
  if (isImage && !isSmall) {
    return (
      <div className="relative group rounded-[16px] overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm bg-white dark:bg-gray-900 transition-all hover:shadow-md">
        <img 
          src={displayUrl} 
          alt={at.name} 
          className="max-w-[280px] max-h-[280px] object-contain cursor-zoom-in"
          referrerPolicy="no-referrer"
          onClick={() => onEnlarge?.(displayUrl)}
        />
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-between">
          <span className="text-[10px] text-white truncate font-medium mr-2">{at.name}</span>
          <div className="flex items-center gap-1.5">
            {onReference && (
              <button 
                onClick={(e) => { e.stopPropagation(); onReference(at); }}
                className="p-1.5 bg-white/20 hover:bg-brand/80 backdrop-blur-md rounded-full text-white transition-colors"
                title="引用为附件"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>
            )}
            {!isExportDisabled && (
              <button 
                onClick={handleDownload}
                disabled={isDownloading}
                className={`p-1.5 bg-white/20 backdrop-blur-md rounded-full text-white transition-colors ${isDownloading ? 'opacity-80 cursor-not-allowed' : 'hover:bg-white/30 cursor-pointer'}`}
                title="下载图片"
              >
                {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if ((isAudio || isVideo) && !isSmall) {
    return (
      <div className={`p-3 rounded-[16px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 shadow-sm ${isUser ? 'bg-white/10 border-white/20' : ''}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-[10px] font-medium opacity-70">
            {isAudio ? <Volume2 className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span className="truncate max-w-[150px]">{at.name}</span>
          </div>
          {!isExportDisabled && (
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className={`p-1.5 rounded-full transition-colors ${isDownloading ? 'opacity-80 cursor-not-allowed text-gray-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-brand cursor-pointer'}`}
              title="下载媒体文件"
            >
              {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {isAudio ? (
          <audio controls className="h-8 w-full max-w-[240px]">
            <source src={displayUrl} type={at.type} />
          </audio>
        ) : (
          <video controls className="max-w-[280px] rounded-xl overflow-hidden shadow-sm">
            <source src={displayUrl} type={at.type} />
          </video>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center gap-3 p-3 rounded-[16px] border shadow-sm hover:shadow-md transition-all group ${
        isUser 
          ? 'bg-white/10 border-white/20 text-white' 
          : 'bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100'
      } ${isSmall ? 'max-w-[200px]' : 'w-full max-w-[280px]'} ${isImage ? 'cursor-zoom-in' : ''}`}
      onClick={() => isImage && onEnlarge?.(at.url)}
    >
      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
        isUser ? 'bg-white/20 text-white' :
        isImage ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500' :
        at.type.includes('pdf') ? 'bg-red-50 dark:bg-red-900/20 text-red-500' :
        at.type.includes('csv') || at.type.includes('excel') ? 'bg-green-50 dark:bg-green-900/20 text-green-500' :
        'bg-gray-50 dark:bg-gray-800 text-gray-500'
      }`}>
        {isImage ? <ImageIcon className="w-5 h-5" /> : <FileIcon className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold truncate mb-0.5 ${isUser ? 'text-white' : ''}`} title={at.name}>
          {at.name}
        </div>
        <div className={`text-[10px] flex items-center gap-2 ${isUser ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
          <span>{formatSize(at.size || 0)}</span>
          {at.type && <span className="opacity-50 uppercase">{at.type.split('/').pop()}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {!isExportDisabled && (
          <button 
            onClick={handleDownload}
            disabled={isDownloading}
            className={`p-2 rounded-full transition-colors ${
              isDownloading ? 'opacity-80 cursor-not-allowed' :
              isUser ? 'hover:bg-white/20 text-white/70 hover:text-white cursor-pointer' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-brand cursor-pointer'
            }`}
            title="下载文件"
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
};
