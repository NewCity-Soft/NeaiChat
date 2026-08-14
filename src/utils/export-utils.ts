import { Chat, Message } from '../types';
import { createAIGCMetadata, downloadWithAIGCMetadata } from './aigc-metadata';

export interface ExportOptions {
  format: 'markdown' | 'json' | 'pdf';
  includeSystemMessages: boolean;
  includeTimestamps: boolean;
  includeMetadata: boolean;
  includeToolCalls: boolean;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function generateExportContent(chat: Chat, options: ExportOptions, modelName?: string, apiUrl?: string): string {
  if (options.format === 'json') {
    return generateJsonExport(chat, options, modelName, apiUrl);
  }
  return generateMarkdownExport(chat, options, modelName, apiUrl);
}

function generateMarkdownExport(chat: Chat, options: ExportOptions, modelName?: string, apiUrl?: string): string {
  const metadata = createAIGCMetadata(chat.id, apiUrl);
  const commentBlock = `<!-- AIGC_METADATA: ${JSON.stringify(metadata)} -->`;
  const lines: string[] = [commentBlock, ''];

  // Header Metadata
  if (options.includeMetadata) {
    lines.push(`# ${chat.title || '未命名对话'}`);
    lines.push('');
    lines.push('> 🛡️ **AI 合成内容声明**：本对话记录由 NeaiChat (AI Assistant) 生成并整理，包含 AI 人工智能合成内容，遵循 HarmonyOS 7 AIGC 标识规范。');
    lines.push(`> - **AIGC 标识**: Label=\`${metadata.Label}\` | ContentProducer=\`${metadata.ContentProducer}\` | ContentPropagator=\`${metadata.ContentPropagator}\``);
    lines.push(`> - **溯源编号 (ProduceID)**: \`${metadata.ProduceID}\``);
    lines.push(`> - **导出时间**: ${new Date().toLocaleString('zh-CN')}`);
    if (modelName) {
      lines.push(`> - **模型**: \`${modelName}\``);
    }
    lines.push(`> - **消息总数**: ${chat.messages.length} 条`);
    if (chat.usage?.totalTokens) {
      lines.push(`> - **Token 消耗**: ${chat.usage.totalTokens.toLocaleString()}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const roleMap: Record<string, string> = {
    user: '👤 用户',
    assistant: '🤖 AI 助手',
    system: '⚙️ 系统',
    tool: '🛠️ 工具调用结果',
  };

  // Messages
  chat.messages.forEach((msg: Message) => {
    // Filter system messages if disabled
    if (msg.role === 'system' && !options.includeSystemMessages) {
      return;
    }
    // Filter tool messages if disabled
    if (msg.role === 'tool' && !options.includeToolCalls) {
      return;
    }

    const roleName = roleMap[msg.role] || msg.role;
    let headerText = `### ${roleName}`;

    if (options.includeTimestamps && msg.timestamp) {
      const timeStr = new Date(msg.timestamp).toLocaleString('zh-CN');
      headerText += ` \`<${timeStr}>\``;
    }

    if (msg.isPinned) {
      headerText += ' 📌 [已置顶]';
    }

    lines.push(headerText);
    lines.push('');

    // Attachments
    if (msg.attachments && msg.attachments.length > 0) {
      lines.push('**📎 附件列表:**');
      msg.attachments.forEach(att => {
        lines.push(`- ${att.name} (${formatFileSize(att.size || 0)})`);
      });
      lines.push('');
    }

    // Content
    if (msg.content) {
      lines.push(msg.content);
      lines.push('');
    }

    // Tool Calls (Assistant side)
    if (options.includeToolCalls && msg.tool_calls && msg.tool_calls.length > 0) {
      lines.push('```json');
      lines.push('// 工具调用日志');
      lines.push(JSON.stringify(msg.tool_calls, null, 2));
      lines.push('```');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  });

  return lines.join('\n').trim();
}

function generateJsonExport(chat: Chat, options: ExportOptions, modelName?: string, apiUrl?: string): string {
  const metadata = createAIGCMetadata(chat.id, apiUrl);
  const filteredMessages = chat.messages.filter(msg => {
    if (msg.role === 'system' && !options.includeSystemMessages) return false;
    if (msg.role === 'tool' && !options.includeToolCalls) return false;
    return true;
  });

  const exportData = {
    aigcMetadata: metadata,
    watermarkNotice: '本导出的对话内容包含由 AI 模型合成的数据，依据 HarmonyOS 7 AIGC 标识规范嵌入隐式与显式溯源信息。',
    exportVersion: '1.0',
    exportTime: new Date().toISOString(),
    chat: {
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
      model: modelName,
      usage: chat.usage,
      messageCount: filteredMessages.length,
      messages: filteredMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: options.includeTimestamps ? msg.timestamp : undefined,
        isPinned: msg.isPinned || undefined,
        attachments: msg.attachments?.map(a => ({ name: a.name, type: a.type, size: a.size })),
        tool_calls: options.includeToolCalls ? msg.tool_calls : undefined,
        error: msg.error || undefined,
      })),
    },
  };

  return JSON.stringify(exportData, null, 2);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  downloadWithAIGCMetadata(content, filename, mimeType);
}
