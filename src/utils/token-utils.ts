
/**
 * Simple token estimation utility.
 * 
 * Approximate rules:
 * - For English/Latin text: ~4 characters per token.
 * - For CJK (Chinese, Japanese, Korean) text: ~1 token per character.
 * - Mixed text: weighted average.
 */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // Count CJK characters
  const cjkRegex = /[\u4e00-\u9fa5\u3040-\u30ff\uff00-\uffef\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af]/g;
  const cjkMatches = text.match(cjkRegex);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  
  // Rest of the text (approximate as English)
  const nonCjkText = text.replace(cjkRegex, '');
  const englishTokens = Math.ceil(nonCjkText.length / 4);
  
  return cjkCount + englishTokens;
}

export interface TokenUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}
