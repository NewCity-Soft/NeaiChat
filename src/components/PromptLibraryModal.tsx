import { useState } from 'react';
import { X, Plus, Trash2, Check, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PromptTemplate } from '../types';
import { useTranslation } from '../i18n';

interface PromptLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: PromptTemplate[];
  onUpdateTemplates: (templates: PromptTemplate[]) => void;
  onSelectTemplate: (content: string) => void;
}

export function PromptLibraryModal({
  isOpen,
  onClose,
  templates,
  onUpdateTemplates,
  onSelectTemplate,
}: PromptLibraryModalProps) {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newTitle || !newContent) return;
    const newTemplate: PromptTemplate = {
      id: crypto.randomUUID(),
      title: newTitle,
      content: newContent,
    };
    onUpdateTemplates([newTemplate, ...templates]);
    setNewTitle('');
    setNewContent('');
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    onUpdateTemplates(templates.filter(t => t.id !== id));
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-3xl bg-white dark:bg-[#1c1c1e] rounded-3xl md:rounded-[32px] shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[85vh] overflow-hidden"
        >
          <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white/90 dark:bg-[#1c1c1e]/90 backdrop-blur-md z-10">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{t('prompt_library', '提示词库')}</h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('prompt_library_subtitle', '保存并快速复用你的常用提示词')}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isAdding ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-gray-50 dark:bg-[#2c2c2e] rounded-2xl border border-brand/20 space-y-3"
              >
                <input
                  type="text"
                  placeholder={t('template_title_placeholder', '模板标题')}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <textarea
                  placeholder={t('template_content_placeholder', '提示词内容...')}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsAdding(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 cursor-pointer"
                  >
                    {t('cancel', '取消')}
                  </button>
                  <button
                    onClick={handleAdd}
                    className="px-4 py-2 bg-brand dark:bg-brand-dark text-white rounded-xl text-sm font-medium cursor-pointer"
                  >
                    {t('save_template', '保存模板')}
                  </button>
                </div>
              </motion.div>
            ) : (
              <button
                onClick={() => setIsAdding(true)}
                className="w-full p-4 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center gap-2 text-gray-400 hover:border-brand hover:text-brand transition-all group cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                <span className="font-medium">{t('new_template', '新建提示词模板')}</span>
              </button>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 bg-gray-50 dark:bg-[#2c2c2e] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-brand/30 dark:hover:border-brand-dark/30 transition-all group relative"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-gray-900 dark:text-white truncate">{template.title}</h3>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(template.id, template.content)}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-brand transition-colors cursor-pointer"
                      >
                        {copiedId === template.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-4">{template.content}</p>
                  <button
                    onClick={() => {
                      onSelectTemplate(template.content);
                      onClose();
                    }}
                    className="w-full py-2 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 rounded-xl text-xs font-bold text-brand dark:text-brand-dark hover:bg-brand hover:text-white dark:hover:bg-brand-dark transition-all cursor-pointer"
                  >
                    {t('use_now', '立即使用')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
