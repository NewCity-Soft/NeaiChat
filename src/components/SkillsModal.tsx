import { motion, AnimatePresence } from 'motion/react';
import { X, Wrench, Search, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { tools } from '../services/tools';
import { AppSettings } from '../types';

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
}

export function SkillsModal({ isOpen, onClose, settings }: SkillsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const displayTools = tools.filter(t => t.name !== 'update_memory');
  const filteredTools = displayTools.filter(tool => 
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          className="relative w-full max-w-2xl bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[85vh] overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#1c1c1e] z-10 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand/10 dark:bg-brand-dark/20 text-brand dark:text-brand-dark rounded-xl">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">工具库 (Skills Library)</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">查看 AI 具备的各项专业技能与工具</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-brand transition-colors" />
              <input
                type="text"
                placeholder="搜索技能名称或描述..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-[#2c2c2e] border border-gray-100 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {filteredTools.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-12 h-12 text-gray-200 dark:text-gray-800 mb-4" />
                <p className="text-gray-400">没有找到匹配的技能</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredTools.map((tool) => {
                  let needsConfig = false;
                  if (tool.name === 'internet_search' && !settings.searchApiKey) {
                    needsConfig = true;
                  } else if (tool.name === 'execute_ssh_command') {
                    needsConfig = !settings.sshBridgeUrl || !settings.remoteServers || settings.remoteServers.length === 0;
                  }
                  
                  return (
                    <div
                      key={tool.name}
                      className="p-4 bg-gray-50 dark:bg-[#2c2c2e] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-brand/30 dark:hover:border-brand-dark/30 transition-all flex flex-col"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-white dark:bg-[#1c1c1e] rounded-lg border border-gray-100 dark:border-gray-700 flex items-center justify-center shadow-sm">
                            <Wrench className="w-4 h-4 text-brand dark:text-brand-dark" />
                          </div>
                          <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate max-w-[120px]">
                            {tool.name}
                          </span>
                        </div>
                        {needsConfig ? (
                          <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-3 h-3" />
                            <span>需配置</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>已激活</span>
                          </div>
                        )}
                      </div>
                      
                      <p className="text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3 mb-4 flex-1">
                        {tool.description}
                      </p>

                      <div className="pt-3 border-t border-gray-100 dark:border-gray-700/50 flex flex-wrap gap-1.5">
                        {Object.keys(tool.parameters.properties).map(param => (
                          <span key={param} className="px-2 py-0.5 bg-gray-200/50 dark:bg-gray-800 text-[10px] text-gray-500 rounded-md font-mono">
                            {param}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MCP Servers Info */}
            {settings.mcpServers && settings.mcpServers.length > 0 && (
              <div className="mt-8 space-y-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">MCP 扩展技能</h3>
                <div className="space-y-3">
                  {settings.mcpServers.map(server => (
                    <div key={server.id} className="p-4 bg-brand/5 dark:bg-brand-dark/10 rounded-2xl border border-brand/10 dark:border-brand-dark/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand dark:bg-brand-dark text-white rounded-xl">
                          <Zap className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-brand dark:text-brand-dark">{server.name}</div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{server.url}</div>
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-brand/50 dark:text-brand-dark/50">已连接</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-gray-50/50 dark:bg-[#1c1c1e] border-t border-gray-100 dark:border-gray-800 text-center">
            <p className="text-[10px] text-gray-400">
              这些工具由模型自动决定何时调用。你可以在“设置-工具扩展”中配置更多高级选项。
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
