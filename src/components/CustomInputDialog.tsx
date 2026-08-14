import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, ListFilter, X, MessageSquareText, Eye, EyeOff } from 'lucide-react';
import { setInputListener, InputRequest } from '../services/inputService';

export const CustomInputDialog: React.FC = () => {
  const [request, setRequest] = useState<InputRequest | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    setInputListener((req) => {
      setRequest(req);
      setShowPassword(false);
      if (req?.inputType === 'select' && req.options && req.options.length > 0) {
        setInputValue(req.options[0]);
      } else {
        setInputValue('');
      }
    });
  }, []);

  useEffect(() => {
    if (request) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [request]);

  if (!request) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    request.resolve(inputValue);
  };

  const handleCancel = () => {
    request.resolve('');
  };

  const inputType = request.inputType || 'text';
  const title = request.title || '请求用户输入';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
          className="w-full max-w-[400px] bg-white/90 dark:bg-black/80 backdrop-blur-2xl rounded-[32px] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.15)] border border-white/20 dark:border-white/10 overflow-hidden ring-1 ring-black/5 dark:ring-white/5"
        >
          <div className="px-6 pt-6 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#0a59f7]/10 dark:bg-[#317af7]/20 flex items-center justify-center text-[#0a59f7] dark:text-[#317af7]">
                {inputType === 'select' ? (
                  <ListFilter className="w-5 h-5" />
                ) : (
                  <Terminal className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <h3 className="text-[17px] font-bold text-gray-900 dark:text-gray-50 tracking-tight">
                  {title}
                </h3>
              </div>
            </div>
            <button
              onClick={handleCancel}
              className="p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-90"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {request.prompt && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5 shadow-inner">
                <MessageSquareText className="w-4 h-4 text-[#0a59f7] dark:text-[#317af7] shrink-0 mt-0.5" />
                <p className="text-[14px] leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-medium">
                  {request.prompt}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-gray-500 dark:text-gray-400 ml-1">
                {inputType === 'select' ? '请选择一个选项' : '输入内容'}
              </label>
              {inputType === 'select' ? (
                <div className="relative group">
                  <select
                    ref={inputRef as React.RefObject<HTMLSelectElement>}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="w-full px-4 py-3.5 bg-gray-100/50 dark:bg-white/5 border-2 border-transparent focus:border-[#0a59f7] dark:focus:border-[#317af7] rounded-2xl text-[15px] font-medium text-gray-900 dark:text-gray-100 transition-all cursor-pointer appearance-none outline-none"
                  >
                    {request.options && request.options.length > 0 ? (
                      request.options.map((opt, idx) => (
                        <option key={idx} value={opt} className="dark:bg-gray-900">
                          {opt}
                        </option>
                      ))
                    ) : (
                      <option value="">无可用选项</option>
                    )}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-focus-within:text-[#0a59f7] transition-colors">
                    <ListFilter className="w-4 h-4" />
                  </div>
                </div>
              ) : inputType === 'password' ? (
                <div className="relative group">
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type={showPassword ? 'text' : 'password'}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={request.placeholder || '在此输入密码...'}
                    className="w-full px-5 py-3.5 bg-gray-100/50 dark:bg-white/5 border-2 border-transparent focus:border-[#0a59f7] dark:focus:border-[#317af7] rounded-2xl text-[15px] font-medium text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all outline-none pr-12 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              ) : (
                <div className="relative group">
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type={inputType === 'number' ? 'number' : inputType === 'date' ? 'date' : inputType === 'color' ? 'color' : 'text'}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={request.placeholder || '在此输入文本...'}
                    className={`w-full px-5 py-3.5 bg-gray-100/50 dark:bg-white/5 border-2 border-transparent focus:border-[#0a59f7] dark:focus:border-[#317af7] rounded-2xl text-[15px] font-medium text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all outline-none shadow-sm ${
                      inputType === 'color' ? 'h-14 cursor-pointer p-2' : ''
                    }`}
                  />
                </div>
              )}
            </div>
            <div className="pt-2 flex flex-col gap-3">
              <button
                type="submit"
                className="w-full py-3.5 text-[15px] font-bold text-white bg-[#0a59f7] dark:bg-[#317af7] hover:opacity-90 active:scale-[0.98] rounded-full shadow-lg shadow-[#0a59f7]/20 dark:shadow-[#317af7]/20 transition-all"
              >
                确认提交
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="w-full py-3 text-[14px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                取消输入
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
