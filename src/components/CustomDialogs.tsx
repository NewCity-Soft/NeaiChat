import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, HelpCircle, X } from 'lucide-react';
import { setConfirmListener, setAlertListener, ConfirmRequest, AlertRequest } from '../services/dialogService';

export const CustomDialogs: React.FC = () => {
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [alertReq, setAlertReq] = useState<AlertRequest | null>(null);

  useEffect(() => {
    setConfirmListener((req) => setConfirmReq(req));
    setAlertListener((req) => setAlertReq(req));
  }, []);

  const handleConfirm = (val: boolean) => {
    if (confirmReq) confirmReq.resolve(val);
  };

  const handleAlertClose = () => {
    if (alertReq) alertReq.resolve();
  };

  return (
    <>
      <AnimatePresence>
        {confirmReq && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
              className="w-full max-w-[400px] bg-white/90 dark:bg-black/80 backdrop-blur-2xl rounded-[32px] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.15)] border border-white/20 dark:border-white/10 overflow-hidden ring-1 ring-black/5 dark:ring-white/5"
            >
              <div className="px-6 pt-6 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <h3 className="text-[17px] font-bold text-gray-900 dark:text-gray-50 tracking-tight">
                    {confirmReq.options?.title || '请确认'}
                  </h3>
                </div>
                <button
                  onClick={() => handleConfirm(false)}
                  className="p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 pt-2">
                <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 font-medium">
                  {confirmReq.message}
                </p>
                <div className="mt-8 flex gap-3">
                  <button
                    onClick={() => handleConfirm(false)}
                    className="flex-1 py-3 text-[14px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl transition-all"
                  >
                    {confirmReq.options?.cancelText || '取消'}
                  </button>
                  <button
                    onClick={() => handleConfirm(true)}
                    className="flex-1 py-3 text-[14px] font-bold text-white bg-[#0a59f7] dark:bg-[#317af7] hover:opacity-90 active:scale-[0.98] rounded-xl shadow-lg shadow-[#0a59f7]/20 dark:shadow-[#317af7]/20 transition-all"
                  >
                    {confirmReq.options?.confirmText || '确定'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {alertReq && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
              className="w-full max-w-[400px] bg-white/90 dark:bg-black/80 backdrop-blur-2xl rounded-[32px] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.15)] border border-white/20 dark:border-white/10 overflow-hidden ring-1 ring-black/5 dark:ring-white/5"
            >
              <div className="px-6 pt-6 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <h3 className="text-[17px] font-bold text-gray-900 dark:text-gray-50 tracking-tight">
                    {alertReq.options?.title || '提示'}
                  </h3>
                </div>
                <button
                  onClick={handleAlertClose}
                  className="p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 pt-2">
                <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 font-medium whitespace-pre-wrap">
                  {alertReq.message}
                </p>
                <div className="mt-8">
                  <button
                    onClick={handleAlertClose}
                    className="w-full py-3.5 text-[15px] font-bold text-white bg-[#0a59f7] dark:bg-[#317af7] hover:opacity-90 active:scale-[0.98] rounded-xl shadow-lg shadow-[#0a59f7]/20 dark:shadow-[#317af7]/20 transition-all"
                  >
                    {alertReq.options?.confirmText || '确定'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
