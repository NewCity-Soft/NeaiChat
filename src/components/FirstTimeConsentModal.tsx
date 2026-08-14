import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, FileText, CheckCircle2, XCircle, ChevronRight, ArrowLeft, Loader2, Info } from 'lucide-react';
import { USER_SERVICE_AGREEMENT, PRIVACY_POLICY_URL } from '../constants/legalDocs';

interface FirstTimeConsentModalProps {
  isOpen: boolean;
  onAgree: () => void;
}

type ConsentStep = 'agreement' | 'privacy' | 'confirm';

export const FirstTimeConsentModal: React.FC<FirstTimeConsentModalProps> = ({
  isOpen,
  onAgree,
}) => {
  const [step, setStep] = useState<ConsentStep>('agreement');
  const [hasReadAgreement, setHasReadAgreement] = useState(false);
  const [hasReadPrivacy, setHasReadPrivacy] = useState(false);
  const [isPrivacyLoaded, setIsPrivacyLoaded] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);

  if (!isOpen) return null;

  const handleAgreementScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 60) {
      setHasReadAgreement(true);
    }
  };

  const handleDisagree = () => {
    window.location.href = "about:blank";
  };

  const nextStep = () => {
    if (step === 'agreement') setStep('privacy');
    else if (step === 'privacy') setStep('confirm');
  };

  const prevStep = () => {
    if (step === 'privacy') setStep('agreement');
    else if (step === 'confirm') setStep('privacy');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white dark:bg-black overflow-hidden">
        {/* Abstract Background Elements */}
        <div className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-40">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand/5 rounded-full blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative flex flex-col w-full h-full bg-white dark:bg-[#0a0a0a] overflow-hidden"
        >
          {/* Header & Progress Indicator */}
          <div className="px-6 py-5 sm:px-16 sm:py-8 border-b border-gray-100 dark:border-gray-900 shrink-0">
            <div className="flex items-center gap-4 sm:gap-6 mb-4 sm:mb-6">
              {step !== 'agreement' ? (
                <button 
                  onClick={prevStep}
                  className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white transition-colors flex items-center justify-center cursor-pointer"
                  title="返回上一步"
                >
                  <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand/10 dark:bg-brand-dark/20 rounded-2xl flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 sm:w-7 h-7 text-brand dark:text-brand-dark" />
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-[10px] sm:text-[11px] text-brand font-black uppercase tracking-[0.2em]">{step === 'agreement' ? '01' : step === 'privacy' ? '02' : '03'} / 03</span>
                <h2 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white mt-0.5 sm:mt-1 leading-tight">
                  {step === 'agreement' ? USER_SERVICE_AGREEMENT.title : step === 'privacy' ? '隐私政策' : '确认授权'}
                </h2>
              </div>
            </div>

            <div className="flex gap-2 h-1 w-full bg-gray-100 dark:bg-gray-800/30 rounded-full overflow-hidden">
              <motion.div 
                className="bg-brand h-full rounded-full shadow-[0_0_12px_rgba(10,89,247,0.3)]"
                animate={{ width: step === 'agreement' ? '33.3%' : step === 'privacy' ? '66.6%' : '100%' }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              />
            </div>
          </div>

          {/* Sequential Content Layers */}
          <div className="flex-1 relative overflow-hidden">
            <AnimatePresence mode="wait">
              {step === 'agreement' && (
                <motion.div
                  key="agreement"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  className="absolute inset-0 flex flex-col"
                >
                  <div 
                    onScroll={handleAgreementScroll}
                    className="flex-1 overflow-y-auto px-6 sm:px-16 pt-6 pb-8 space-y-6 text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed scroll-smooth"
                  >
                    {USER_SERVICE_AGREEMENT.sections.map((section, idx) => (
                      <div key={idx} className="space-y-3">
                        <h4 className="font-bold text-gray-900 dark:text-gray-200 text-base sm:text-lg">{section.title}</h4>
                        {section.paragraphs?.map((p, pIdx) => <p key={pIdx}>{p}</p>)}
                        {section.listItems && (
                          <ul className="list-disc list-inside space-y-2 pl-4">
                            {section.listItems.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {step === 'privacy' && (
                <motion.div
                  key="privacy"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  className="absolute inset-0 flex flex-col"
                >
                  <div className="flex-1 relative bg-white dark:bg-black/40 sm:mx-16 my-4 sm:my-8 sm:rounded-[32px] sm:border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <iframe 
                      src={PRIVACY_POLICY_URL}
                      className="w-full h-full border-none"
                      onLoad={() => {
                        setIsPrivacyLoaded(true);
                        setHasReadPrivacy(true);
                      }}
                      title="隐私政策网页"
                    />
                    {!isPrivacyLoaded && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white dark:bg-[#0a0a0a] z-10">
                        <Loader2 className="w-10 h-10 text-brand animate-spin" />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {step === 'confirm' && (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center p-10 text-center"
                >
                  <div className="w-28 h-28 bg-green-500/10 rounded-full flex items-center justify-center mb-8 relative">
                    <CheckCircle2 className="w-14 h-14 text-green-500" />
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute inset-0 bg-green-500/20 rounded-full"
                    />
                  </div>
                  <h3 className="text-3xl font-black text-gray-900 dark:text-white">最后一步：确认授权</h3>
                  <p className="text-gray-500 dark:text-gray-400 mt-5 max-w-md mx-auto leading-relaxed text-sm sm:text-base">
                    您已完成所有协议阅读。请确认您已完全理解并愿意遵守上述所有条款，以便开启完整的软件体验。
                  </p>
                  
                  <div className="mt-12 p-8 bg-gray-50 dark:bg-white/[0.03] rounded-[32px] border border-gray-100 dark:border-gray-800 w-full max-w-sm transition-all hover:border-brand/30">
                    <label className="flex items-start gap-5 cursor-pointer text-left group">
                      <div className="relative flex items-center justify-center mt-1 shrink-0">
                        <input 
                          type="checkbox"
                          checked={isAgreed}
                          onChange={(e) => setIsAgreed(e.target.checked)}
                          className="peer appearance-none w-7 h-7 border-2 border-gray-300 dark:border-gray-700 rounded-xl checked:bg-brand checked:border-brand transition-all cursor-pointer"
                        />
                        <CheckCircle2 className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                      </div>
                      <span className="text-sm sm:text-base text-gray-700 dark:text-gray-300 font-bold group-hover:text-brand transition-colors leading-snug">
                        我已确认所有法律条款，并授权软件正常运行。
                      </span>
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Bar */}
          <div className="px-6 py-6 sm:px-16 sm:py-10 border-t border-gray-100 dark:border-gray-900 bg-white dark:bg-[#0a0a0a] shrink-0">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 max-w-5xl mx-auto w-full">
              <button
                onClick={handleDisagree}
                className="px-8 py-3.5 sm:px-10 sm:py-5 rounded-[20px] sm:rounded-[24px] text-sm sm:text-base font-bold text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer order-2 sm:order-1 group"
              >
                <XCircle className="w-5 h-5 opacity-40 group-hover:opacity-100 transition-opacity" />
                不同意并退出
              </button>

              {step !== 'confirm' ? (
                <button
                  onClick={nextStep}
                  disabled={(step === 'agreement' && !hasReadAgreement) || (step === 'privacy' && !hasReadPrivacy)}
                  className={`flex-1 px-8 py-3.5 sm:px-10 sm:py-5 rounded-[20px] sm:rounded-[24px] text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 order-1 sm:order-2 shadow-[0_20px_40px_-10px_rgba(10,89,247,0.2)] ${
                    ((step === 'agreement' && hasReadAgreement) || (step === 'privacy' && hasReadPrivacy))
                      ? 'bg-brand text-white hover:opacity-90 cursor-pointer active:scale-[0.98]'
                      : 'bg-gray-100 dark:bg-gray-900 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  下一步
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => isAgreed && onAgree()}
                  disabled={!isAgreed}
                  className={`flex-1 px-8 py-3.5 sm:px-10 sm:py-5 rounded-[20px] sm:rounded-[24px] text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 order-1 sm:order-2 shadow-[0_24px_48px_-12px_rgba(10,89,247,0.3)] ${
                    isAgreed 
                      ? 'bg-brand text-white hover:opacity-90 cursor-pointer active:scale-[0.98]' 
                      : 'bg-gray-100 dark:bg-gray-900 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  同意并开启体验
                </button>
              )}
            </div>
            
            {step === 'agreement' && !hasReadAgreement && (
              <p className="mt-4 sm:mt-6 text-[10px] text-brand/60 text-center font-bold uppercase tracking-widest animate-pulse flex items-center justify-center gap-2">
                <Info className="w-3 h-3" />
                请阅读完毕以继续
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
