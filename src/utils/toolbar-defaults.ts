import { ToolbarItemConfig } from '../types';

export const DEFAULT_BUBBLE_TOOLS: ToolbarItemConfig[] = [
  { id: 'version_switch', name: '版本切换', visible: true },
  { id: 'edit', name: '编辑', visible: true },
  { id: 'regenerate', name: '重新生成', visible: true },
  { id: 'speak', name: '语音朗读', visible: true },
  { id: 'branch', name: '派生新对话', visible: true },
  { id: 'pin', name: '固定消息', visible: true },
  { id: 'copy', name: '复制内容', visible: true },
  { id: 'delete', name: '删除消息', visible: true },
];

export const DEFAULT_HEADER_TOOLS: ToolbarItemConfig[] = [
  { id: 'export_chat', name: '导出对话', visible: true },
  { id: 'vfs', name: '虚拟文件系统 (VFS)', visible: true },
  { id: 'compress', name: '压缩历史', visible: false },
  { id: 'prompt_library', name: '提示词库', visible: false },
  { id: 'settings', name: '设置', visible: true },
  { id: 'new_chat', name: '新对话', visible: false },
  { id: 'clear_all', name: '清空当前对话', visible: false },
];

/**
 * Sanitizes user's toolbar configuration against default tools.
 * Ensures no duplicate IDs, maintains user custom order and visibility,
 * and appends any newly introduced tools from default config.
 */
export function sanitizeToolbarConfig(
  userConfig: ToolbarItemConfig[] | undefined,
  defaultConfig: ToolbarItemConfig[]
): ToolbarItemConfig[] {
  let list = userConfig;
  if (!list || !Array.isArray(list) || list.length === 0) {
    list = defaultConfig.map(item => ({ ...item }));
  }

  const result: ToolbarItemConfig[] = [];
  const existingIds = new Set<string>();

  for (const item of list) {
    const defaultMatch = defaultConfig.find(d => d.id === item.id);
    if (defaultMatch && !existingIds.has(item.id)) {
      result.push({
        id: item.id,
        name: defaultMatch.name,
        visible: typeof item.visible === 'boolean' ? item.visible : defaultMatch.visible,
      });
      existingIds.add(item.id);
    }
  }

  for (const defaultItem of defaultConfig) {
    if (!existingIds.has(defaultItem.id)) {
      result.push({ ...defaultItem });
    }
  }

  // If this is header tools (contains export_chat), ensure export_chat is at index 0 if not explicitly moved by user
  const isHeader = defaultConfig.some(d => d.id === 'export_chat');
  if (isHeader) {
    const exportIdx = result.findIndex(r => r.id === 'export_chat');
    if (exportIdx > 0) {
      const [item] = result.splice(exportIdx, 1);
      result.unshift(item);
    }
  }

  return result;
}
