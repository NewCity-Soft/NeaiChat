import { Message } from '../types';

export interface SplitResult {
  coldMessages: Message[];
  hotMessages: Message[];
}

/**
 * 分割对话分层（冷热数据拆分）
 * @param messages 完整消息数组
 * @param hotZoneRounds 热区保留的最新对话轮数（默认 5）
 */
export function splitColdAndHotZone(messages: Message[], hotZoneRounds: number = 5): SplitResult {
  if (!messages || messages.length === 0) {
    return { coldMessages: [], hotMessages: [] };
  }

  // 找到所有非压缩摘要的用户消息索引
  const userIndices: number[] = [];
  messages.forEach((msg, idx) => {
    if (msg.role === 'user' && !msg.isCompressedSummary) {
      userIndices.push(idx);
    }
  });

  // 如果总用户对话轮数小于等于设定的热区轮数 N
  if (userIndices.length <= hotZoneRounds) {
    return {
      coldMessages: [],
      hotMessages: [...messages]
    };
  }

  // 倒数第 N 轮用户消息的起始索引即为冷热拆分点
  const cutoffIndex = userIndices[userIndices.length - hotZoneRounds];

  return {
    coldMessages: messages.slice(0, cutoffIndex),
    hotMessages: messages.slice(cutoffIndex)
  };
}
