import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, FileText, Download, ExternalLink, ShieldAlert } from 'lucide-react';
import { USER_SERVICE_AGREEMENT, EXPORT_NOTICE, PRIVACY_POLICY_URL } from '../constants/legalDocs';
import { ExportMode } from '../types';
import { useTranslation } from '../i18n';

export type LegalDocType = 'privacy' | 'user_agreement' | 'export_notice';

interface LegalNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: LegalDocType;
  /**
   * If true, this modal is acting as the first-time export permission prompt
   * offering the 3 explicit choices.
   */
  isExportPrompt?: boolean;
  onSelectExportMode?: (mode: ExportMode) => void;
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({
  isOpen,
  onClose,
  type,
  isExportPrompt = false,
  onSelectExportMode,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const handleModeChoice = (mode: ExportMode) => {
    if (onSelectExportMode) {
      onSelectExportMode(mode);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="relative flex flex-col bg-bg-primary dark:bg-bg-primary-dark w-full max-w-2xl h-[85vh] max-h-[720px] rounded-[28px] sm:rounded-[32px] border border-gray-200/60 dark:border-gray-800/60 shadow-2xl overflow-hidden"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/60 dark:bg-black/40 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark">
                {type === 'privacy' && <ShieldCheck className="w-5 h-5" />}
                {type === 'user_agreement' && <FileText className="w-5 h-5" />}
                {type === 'export_notice' && <Download className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                  {type === 'privacy' && t('privacy_policy', '隐私政策')}
                  {type === 'user_agreement' && USER_SERVICE_AGREEMENT.title}
                  {type === 'export_notice' && EXPORT_NOTICE.title}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {type === 'user_agreement' && `${t('last_updated', '最近更新日期：')}${USER_SERVICE_AGREEMENT.updateDate}`}
                  {type === 'export_notice' && t('read_export_notice_hint', '请在执行内容导出操作前完整阅读本须知')}
                  {type === 'privacy' && t('privacy_terms', '华为云/DBank 官方隐私政策条款')}
                </p>
              </div>
            </div>

            {!isExportPrompt && (
              <button
                onClick={onClose}
                className="p-2.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Modal Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {type === 'privacy' && (
              <div className="w-full h-full flex flex-col -m-6">
                <iframe 
                  src={PRIVACY_POLICY_URL}
                  className="w-full h-full border-none"
                  title="隐私政策网页"
                />
              </div>
            )}

            {type === 'user_agreement' && (
              <div className="space-y-6">
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 text-xs text-gray-500 dark:text-gray-400">
                  {t('local_app_notice', '提示：本工具软件属于纯本地运行应用，不包含任何云端用户数据收集及服务器后端储存。')}
                </div>
                {USER_SERVICE_AGREEMENT.sections.map((section, idx) => (
                  <div key={idx} className="space-y-2">
                    <h3 className="font-bold text-gray-900 dark:text-white text-base">
                      {section.title}
                    </h3>
                    {section.paragraphs?.map((p, pIdx) => (
                      <p key={pIdx} className="text-xs text-gray-600 dark:text-gray-300">
                        {p}
                      </p>
                    ))}
                    {section.listItems && (
                      <ul className="list-disc list-inside space-y-1 text-xs text-gray-600 dark:text-gray-300 pl-2">
                        {section.listItems.map((item, itemIdx) => (
                          <li key={itemIdx}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}

            {type === 'export_notice' && (
              <div className="space-y-6">
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 text-xs text-gray-600 dark:text-gray-300">
                  {EXPORT_NOTICE.tip}
                </div>

                {EXPORT_NOTICE.sections.map((section, idx) => (
                  <div key={idx} className="space-y-2">
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                      {section.title}
                    </h3>
                    {section.paragraphs?.map((p, pIdx) => (
                      <p key={pIdx} className="text-xs text-gray-600 dark:text-gray-300">
                        {p}
                      </p>
                    ))}
                    {section.listItems && (
                      <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 pl-1">
                        {section.listItems.map((item, itemIdx) => (
                          <li key={itemIdx} className="flex items-start gap-1.5">
                            <span className="text-brand shrink-0">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer / Action Bar */}
          <div className="p-5 border-t border-gray-200/50 dark:border-gray-800/50 bg-white/70 dark:bg-black/50 backdrop-blur-xl shrink-0">
            {isExportPrompt ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium text-center">
                  {t('export_mode_prompt_title', '请选择您的导出许可及水印方式（可在设置中随时重新配置）：')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    onClick={() => handleModeChoice('agree_no_watermark')}
                    className="px-3 py-3 rounded-2xl bg-brand text-white text-xs font-bold hover:opacity-90 transition-all shadow-sm flex flex-col items-center justify-center text-center cursor-pointer min-h-[52px]"
                  >
                    <span>{t('agree_no_watermark_short', '同意并去除显式水印')}</span>
                    <span className="text-[10px] font-normal opacity-80 mt-0.5">{t('keep_implicit_metadata', '保留内部隐式元数据')}</span>
                  </button>

                  <button
                    onClick={() => handleModeChoice('agree_with_watermark')}
                    className="px-3 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold transition-all flex flex-col items-center justify-center text-center cursor-pointer min-h-[52px]"
                  >
                    <span>{t('agree_with_watermark_short', '同意并保留显式水印')}</span>
                    <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400 mt-0.5">{t('includes_ai_label', '包含【AI生成】标注')}</span>
                  </button>

                  <button
                    onClick={() => handleModeChoice('disabled')}
                    className="px-3 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-all flex flex-col items-center justify-center text-center cursor-pointer min-h-[52px]"
                  >
                    <span>{t('disagree_disable_export', '不同意并关闭导出功能')}</span>
                    <span className="text-[10px] font-normal text-rose-500/80 mt-0.5">{t('hides_all_download_buttons', '关闭后隐藏所有下载按钮')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-2xl transition-all cursor-pointer"
                >
                  {t('close', '关闭')}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
