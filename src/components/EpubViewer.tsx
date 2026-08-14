import React, { useEffect, useRef, useState } from 'react';
import ePub, { Rendition } from 'epubjs';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';

export const EpubViewer = ({ fileContent }: { fileContent: string }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [rendition, setRendition] = useState<Rendition | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!viewerRef.current) return;
    
    let book: any = null;
    try {
      const base64 = fileContent.split(',')[1];
      const binaryString = window.atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      book = ePub(bytes.buffer);
      const rend = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
        spread: 'none',
      });
      rend.display();
      setRendition(rend);
    } catch (e: any) {
      setError(e.message || '加载 EPUB 失败');
    }

    return () => {
      if (book) {
        book.destroy();
      }
    };
  }, [fileContent]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-white">
      <div ref={viewerRef} className="flex-1 w-full overflow-hidden" />
      <div className="flex justify-between items-center p-2 border-t border-gray-200 bg-gray-50">
        <button
          onClick={() => rendition?.prev()}
          className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-gray-500 text-sm flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          <span>阅读模式</span>
        </div>
        <button
          onClick={() => rendition?.next()}
          className="p-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
