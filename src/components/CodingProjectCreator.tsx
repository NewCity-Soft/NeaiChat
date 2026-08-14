import { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { CODING_TEMPLATES, ProjectTemplate } from '../utils/codingTemplates';
import { VFSItem } from '../utils/vfs';

interface CodingProjectCreatorProps {
  onCreateProject: (projectName: string, initialFiles: VFSItem[], prompt: string) => void;
}

export function CodingProjectCreator({ onCreateProject }: CodingProjectCreatorProps) {
  const [selectedTemplate] = useState<ProjectTemplate>(CODING_TEMPLATES[0]);
  const [projectName, setProjectName] = useState('我的 SPA 应用程序');
  const [prompt, setPrompt] = useState(selectedTemplate.initialPrompt);

  const handleStart = () => {
    const finalName = projectName.trim() || selectedTemplate.defaultTitle;
    const initialFiles = selectedTemplate.getFiles(finalName);
    onCreateProject(finalName, initialFiles, prompt.trim());
  };



  return (
    <div className="w-full h-full overflow-y-auto bg-gray-50 dark:bg-[#121214] p-4 md:p-10 flex flex-col items-center">
      <div className="max-w-3xl w-full my-auto space-y-8 animate-in fade-in duration-300 py-6">

        {/* Project Meta Input Card */}
        <div className="bg-white/90 dark:bg-[#1c1c20]/90 backdrop-blur-2xl p-6 md:p-8 rounded-[24px] border border-gray-200/80 dark:border-gray-800/80 shadow-lg space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              项目名称
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="如：数据导出与分析工具..."
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#121214] border border-gray-200 dark:border-gray-700/80 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand-dark/30 transition-all font-medium"
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand dark:text-brand-dark" />
                <span>初始编程需求描述 (Prompt)</span>
              </label>
            </div>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="告诉 AI 你想在这个 SPA 应用中实现什么页面与功能..."
              className="w-full p-4 bg-gray-50 dark:bg-[#121214] border border-gray-200 dark:border-gray-700/80 rounded-[16px] text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand-dark/30 transition-all leading-relaxed"
            />
            

          </div>

          <div className="pt-2">
            <button
              onClick={handleStart}
              className="w-full py-3.5 px-6 bg-brand dark:bg-brand-dark hover:opacity-90 active:scale-[0.99] text-white rounded-full font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <span>初始化项目并进入编程模式</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
