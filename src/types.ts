import { VFSItem } from './utils/vfs';

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  vfsPath?: string;
}

export interface ContentBlock {
  type: 'text' | 'tool_call';
  content?: string;
  tool_call?: any;
  tcId?: string;
}

export interface MessageVersion {
  content: string;
  tool_calls?: any[];
  blocks?: ContentBlock[];
  error?: string;
  isError?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  isPinned?: boolean;
  isCompressedSummary?: boolean;
  isCompressedSummaryReply?: boolean;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  attachments?: Attachment[];
  versions?: MessageVersion[];
  currentVersionIndex?: number;
  error?: string;
  isError?: boolean;
  reasoning_content?: string;
  blocks?: ContentBlock[];
}

export interface TokenUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

export type ChatMode = 'standard' | 'coding';

export interface CodingProject {
  id: string;
  name: string;
  description?: string;
  template?: string;
  isInitialized: boolean;
  vfsFiles: VFSItem[];
  activeFilePath?: string;
}

export interface Chat {
  id: string;
  title: string;
  mode?: ChatMode;
  codingProject?: CodingProject;
  messages: Message[];
  updatedAt: number;
  usage?: TokenUsage;
}

export interface CustomProvider {
  id: string;
  name: string;
  url: string;
  defaultModel: string;
  protocol?: 'openai' | 'anthropic' | 'gemini';
}

export interface RemoteServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export interface MediaProvider {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  protocol?: 'openai' | 'custom';
}

export interface ToolbarItemConfig {
  id: string;
  name: string;
  visible: boolean;
}

export type ExportMode = 'unconfigured' | 'agree_no_watermark' | 'agree_with_watermark' | 'disabled';

export interface AppSettings {
  apiKey: string;
  apiUrl: string;
  searchApiKey?: string;
  mcpServers?: { id: string; name: string; url: string }[];
  remoteServers?: RemoteServer[];
  sshBridgeUrl?: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  apiKeys?: Record<string, string>;
  customProviders?: CustomProvider[];
  protocol?: 'openai' | 'anthropic' | 'gemini' | 'auto';
  themeMode?: 'light' | 'dark' | 'system';
  autoEvolve?: boolean;
  preloadPyodide?: boolean;
  hotZoneRounds?: number;
  imageGen?: MediaProvider;
  videoGen?: MediaProvider;
  bubbleToolsConfig?: ToolbarItemConfig[];
  headerToolsConfig?: ToolbarItemConfig[];
  voiceButtonMode?: 'on' | 'off' | 'auto';
  usageLimit?: number;
  autoGenerateTitle?: boolean;
  autoTitlePrompt?: string;
  compressionIntensity?: 'low' | 'medium' | 'high';
  exportMode?: ExportMode;
  startupBehavior?: 'new' | 'last';
}

export interface ChatChunk {
  type: 'text' | 'tool_call';
  content?: string;
  delta?: any[];
}
