import { AppSettings, Message, ChatChunk } from '../types';
import { LLMEngine } from './llm-engine';

export async function evolveSystemPrompt(
  messages: Message[],
  settings: AppSettings
): Promise<string> {
  return LLMEngine.evolveSystemPrompt(messages, settings);
}

export async function generateTitle(
  content: string,
  settings: AppSettings
): Promise<string> {
  return LLMEngine.generateTitle(content, settings);
}

export async function compressHistory(
  coldMessages: Message[],
  settings: AppSettings
): Promise<string> {
  return LLMEngine.compressHistory(coldMessages, settings);
}

export async function* streamChatCompletion(
  messages: Message[],
  settings: AppSettings,
  signal: AbortSignal
): AsyncGenerator<ChatChunk> {
  yield* LLMEngine.streamCompletion(messages, settings, signal);
}
