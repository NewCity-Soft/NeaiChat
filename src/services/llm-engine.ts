import { AppSettings, Message, ChatChunk } from '../types';
import { getToolDefinitions } from './tools';
import { GoogleGenAI } from '@google/genai';
import { parseError } from '../utils/error-handler';
import { safeParseJSON, repairJSON } from '../utils/safe-json';

export enum Protocol {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GEMINI = 'gemini'
}

export async function detectProtocol(settings: AppSettings): Promise<Protocol> {
  if (settings.protocol && settings.protocol !== 'auto') {
    return settings.protocol as Protocol;
  }

  const url = settings.apiUrl.toLowerCase();
  const model = settings.model.toLowerCase();

  if (url.includes('anthropic.com') || model.includes('claude')) return Protocol.ANTHROPIC;
  if (url.includes('googlevisualization') || url.includes('generativelanguage') || url.includes('google.com') || model.includes('gemini')) return Protocol.GEMINI;
  if (url.includes('openai.com') || model.includes('gpt')) return Protocol.OPENAI;

  // Heuristic for custom endpoints
  try {
    const res = await fetch(settings.apiUrl.trim().replace(/\/+$/, '') + '/chat/completions', { method: 'OPTIONS' });
    if (res.ok) return Protocol.OPENAI;
  } catch (e) {}

  return Protocol.OPENAI;
}

export class LLMEngine {
  static async evolveSystemPrompt(messages: Message[], settings: AppSettings): Promise<string> {
    const protocol = await detectProtocol(settings);
    const history = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
    const systemPromptText = settings.systemPrompt ? `当前系统提示词:\n${settings.systemPrompt}\n\n` : '';
    const prompt = `请根据以下用户的最新对话历史，为AI助手重新编写或优化一段系统提示词（System Prompt）。
要求：
1. 深入理解用户的偏好、特殊要求和潜在的痛点。
2. 将这些提取为具体的、可执行的指导原则，融入系统提示词中。
3. 保持系统提示词专业、简洁。
4. 如果当前已有系统提示词，请在它的基础上进行增补和优化，不要丢失原有核心指令。
5. 请只返回新的系统提示词内容，不要包含任何多余的解释、前言或markdown格式的代码块标记（直接输出纯文本）。

${systemPromptText}对话历史：\n${history}`;

    if (protocol === Protocol.GEMINI) {
      const genAI = new GoogleGenAI({ 
        apiKey: settings.apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      let model = settings.model || 'gemini-1.5-pro';
      if (model.includes('gpt') || model.includes('claude') || !model.includes('gemini')) {
        model = 'gemini-1.5-pro';
      }
      const response = await genAI.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      return response.text?.replace(/^```.*?([\s\S]*?)```$/g, '$1').trim() || settings.systemPrompt || '';
    }

    if (protocol === Protocol.ANTHROPIC) {
      const url = settings.apiUrl.trim().replace(/\/+$/, '') + '/messages';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'dangerously-set-forbidden-header': 'true'
        },
        body: JSON.stringify({
          model: settings.model || 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.content?.[0]?.text?.replace(/^```.*?([\s\S]*?)```$/g, '$1').trim() || settings.systemPrompt || '';
    }

    // Default OpenAI
    let baseUrl = settings.apiUrl.trim().replace(/\/+$/, '');
    if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/chat/completions')) baseUrl += '/v1';
    const url = baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.replace(/^```.*?([\s\S]*?)```$/g, '$1').trim() || settings.systemPrompt || '';
  }

  static async generateTitle(content: string, settings: AppSettings): Promise<string> {
    if (settings.autoGenerateTitle === false) {
      return '';
    }

    const defaultPrompt = '为接下来的用户消息生成一个极简标题（1-4个字）。不要使用引号、标点符号或对话语气，只返回标题文本。';
    const promptText = settings.autoTitlePrompt?.trim() || defaultPrompt;

    const protocol = await detectProtocol(settings);
    
    if (protocol === Protocol.GEMINI) {
      const genAI = new GoogleGenAI({ 
        apiKey: settings.apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      let model = settings.model || 'gemini-1.5-flash';
      if (model.includes('gpt') || model.includes('claude') || !model.includes('gemini')) {
        model = 'gemini-1.5-flash';
      }
      const response = await genAI.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `${promptText}\n\n${content}` }] }],
      });
      return response.text || '';
    }

    if (protocol === Protocol.ANTHROPIC) {
      const url = settings.apiUrl.trim().replace(/\/+$/, '') + '/messages';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'dangerously-set-forbidden-header': 'true'
        },
        body: JSON.stringify({
          model: settings.model || 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          messages: [{ role: 'user', content: `${promptText}\n\n${content}` }],
        }),
      });
      const data = await response.json();
      return data.content?.[0]?.text?.trim().replace(/^["']|["']$/g, '') || '';
    }

    // Default OpenAI
    let baseUrl = settings.apiUrl.trim().replace(/\/+$/, '');
    if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/chat/completions')) baseUrl += '/v1';
    const url = baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: promptText },
          { role: 'user', content }
        ],
      }),
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || '';
  }

  static async compressHistory(coldMessages: Message[], settings: AppSettings): Promise<string> {
    const protocol = await detectProtocol(settings);

    const coldText = coldMessages.map(m => {
      const roleName = m.role === 'user' ? '用户' : m.role === 'assistant' ? 'AI助手' : m.role === 'tool' ? '工具返回结果' : '系统';
      let txt = `[${roleName}]: ${m.content}`;
      if (m.attachments && m.attachments.length > 0) {
        txt += ` (包含附件: ${m.attachments.map(a => a.name).join(', ')})`;
      }
      return txt;
    }).join('\n\n');

    const intensity = settings.compressionIntensity || 'medium';
    let lengthConstraint = '300~600 字内';
    let detailInstruction = '深度信息提取与结构化精简总结';
    
    if (intensity === 'low') {
      lengthConstraint = '800~1200 字内';
      detailInstruction = '详细的信息提取，保留较多对话细节、中间推导过程和背景信息';
    } else if (intensity === 'high') {
      lengthConstraint = '150~300 字内';
      detailInstruction = '极度精简的总结，仅保留最核心的需求结论、关键架构决策和最终状态';
    }

    const prompt = `你是一个专业的 AI 对话上下文压缩与信息萃取专家。请对以下【冷区历史对话】进行${detailInstruction}。

【压缩提炼原则】
1. 必须保留：
   - 🎯 需求目标与核心约定（用户想做什么、项目的整体定位、约束与偏好）
   - 💡 核心架构与关键代码逻辑（建立的文件结构、关键 API/函数、重要参数）
   - 🛠️ 已完成的具体步骤与报错修复经验
   - ⚠️ 遗留问题、待处理任务与当前状态
2. 必须删除：
   - 完整的长代码块、大段命令行或运行日志、重复输出
   - 冗余确认与问候话术、调试过程中的失败尝试（仅保留最终采用的方案）

【输出格式要求】
请直接按以下 Markdown 结构输出结构化极简摘要（控制在 ${lengthConstraint}）：

### 📦 历史对话上下文压缩摘要
- **🎯 需求目标与约定**：[核心目标、约束与规范]
- **💡 核心架构与关键逻辑**：[已完成的项目模块、主要接口/参数/函数]
- **🛠️ 关键进度与报错修复**：[已解决的核心问题与重要步骤]
- **⚠️ 遗留问题与当前状态**：[接下来需继续处理的任务或注意事项]

【冷区历史对话记录】：
${coldText}`;

    if (protocol === Protocol.GEMINI) {
      const genAI = new GoogleGenAI({ 
        apiKey: settings.apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      let model = settings.model || 'gemini-1.5-flash';
      if (model.includes('gpt') || model.includes('claude') || !model.includes('gemini')) {
        model = 'gemini-1.5-flash';
      }
      const response = await genAI.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      return response.text || '';
    }

    if (protocol === Protocol.ANTHROPIC) {
      const url = settings.apiUrl.trim().replace(/\/+$/, '') + '/messages';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'dangerously-set-forbidden-header': 'true'
        },
        body: JSON.stringify({
          model: settings.model || 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json();
      return data.content?.[0]?.text?.trim() || '';
    }

    // Default OpenAI
    let baseUrl = settings.apiUrl.trim().replace(/\/+$/, '');
    if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/chat/completions')) baseUrl += '/v1';
    const url = baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  static async transcribeAudio(audioBlob: Blob, settings: AppSettings): Promise<string> {
    const protocol = await detectProtocol(settings);

    if (protocol === Protocol.GEMINI) {
      const genAI = new GoogleGenAI({ 
        apiKey: settings.apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(audioBlob);
      });

      let model = settings.model || 'gemini-1.5-flash';
      if (model.includes('gpt') || model.includes('claude') || !model.includes('gemini')) {
        model = 'gemini-1.5-flash';
      }

      const response = await genAI.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: audioBlob.type, data: base64 } },
          { text: 'Please transcribe the audio into text exactly as it is spoken. Output only the transcription, no other comments.' }
        ] }],
      });
      return response.text || '';
    }

    if (protocol === Protocol.ANTHROPIC) {
      throw new Error('Anthropic API currently does not support audio transcription.');
    }

    // Default OpenAI
    const ext = audioBlob.type.includes('mp4') || audioBlob.type.includes('m4a') ? 'm4a' 
                : audioBlob.type.includes('ogg') ? 'ogg' 
                : audioBlob.type.includes('wav') ? 'wav' 
                : 'webm';
    const formData = new FormData();
    formData.append('file', audioBlob, `audio.${ext}`);
    formData.append('model', 'whisper-1');

    let baseUrl = settings.apiUrl.trim().replace(/\/+$/, '');
    if (baseUrl.includes('/chat/completions')) {
      baseUrl = baseUrl.replace('/chat/completions', '');
    } else if (!baseUrl.endsWith('/v1')) {
      baseUrl += '/v1';
    }
    
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: formData
    });
    
    if (!response.ok) {
      const error = await parseError(response);
      throw new Error(error.message);
    }
    const result = await response.json();
    return result.text || '';
  }

  static async *streamCompletion(messages: Message[], settings: AppSettings, signal: AbortSignal): AsyncGenerator<ChatChunk> {
    const protocol = await detectProtocol(settings);

    let finalSystemPrompt = settings.systemPrompt || '';
    if (settings.autoEvolve) {
      finalSystemPrompt += `\n\n[SYSTEM INSTRUCTION: You have the 'update_memory' tool available. Use it to update your system prompt whenever the user asks you to remember something, changes your persona, or gives you new rules to follow.]`;
    }
    finalSystemPrompt = finalSystemPrompt.trim();

    const processedMessages = [...messages];

    if (protocol === Protocol.GEMINI) {
      const genAI = new GoogleGenAI({ 
        apiKey: settings.apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      let model = settings.model || 'gemini-1.5-flash';
      if (model.includes('gpt') || model.includes('claude') || !model.includes('gemini')) {
        model = 'gemini-1.5-flash';
      }
      const rawTools = await getToolDefinitions(settings);
      
      let contents: any[] = [];
      for (const m of processedMessages) {
        if (m.role === 'system') continue;
        
        const role = m.role === 'assistant' ? 'model' : 'user';
        const parts: any[] = [];

        if (m.role === 'tool') {
          parts.push({
            functionResponse: {
              name: m.name || '',
              response: safeParseJSON(m.content, { result: m.content })
            }
          });
        } else {
          if (m.content) {
            parts.push({ text: m.content });
          }

          if (m.attachments) {
            for (const at of m.attachments) {
              const base64Data = at.url.split(',')[1];
              if (base64Data && (at.type.startsWith('image/') || at.type.startsWith('audio/') || at.type.startsWith('video/') || at.type === 'application/pdf')) {
                parts.push({
                  inlineData: {
                    mimeType: at.type,
                    data: base64Data
                  }
                });
              } else {
                parts.push({ text: `\n[文件附件: ${at.name} (${at.type})]\n` });
              }
            }
          }
          
          if (m.tool_calls) {
            m.tool_calls.forEach(tc => {
              parts.push({
                functionCall: {
                  name: tc.function.name,
                  args: safeParseJSON(tc.function.arguments, {})
                }
              });
            });
          }
        }

        if (parts.length > 0) {
          if (contents.length > 0 && contents[contents.length - 1].role === role) {
            contents[contents.length - 1].parts.push(...parts);
          } else {
            contents.push({ role, parts });
          }
        }
      }

      // Gemini requires starting with 'user' role
      while (contents.length > 0 && contents[0].role !== 'user') {
        contents.shift();
      }

      if (contents.length === 0) {
        // Fallback to a simple message if history is somehow empty after filtering
        contents = [{ role: 'user', parts: [{ text: 'Continue' }] }];
      }

      try {
        const stream = await genAI.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: finalSystemPrompt ? finalSystemPrompt : undefined,
            temperature: typeof settings.temperature === 'number' ? settings.temperature : undefined,
            tools: rawTools.length > 0 ? [{ functionDeclarations: rawTools }] : undefined,
          }
        });

        const seenToolCalls = new Set<string>();
        for await (const chunk of stream) {
          if (chunk.promptFeedback?.blockReason) {
            yield { type: 'text', content: `\n\n[提示词被安全过滤屏蔽，原因: ${chunk.promptFeedback.blockReason}]\n\n` };
          }
          
          let hasOutput = false;
          let finishReason = 'STOP';

          try {
            finishReason = chunk.candidates?.[0]?.finishReason || 'STOP';
          } catch (e) {}

          try {
            const text = chunk.text;
            if (text) {
              hasOutput = true;
              yield { type: 'text', content: text };
            }
          } catch (e) {
            // Ignore getter errors
          }

          try {
            const functionCalls = chunk.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              const newCalls = functionCalls.filter((fc: any) => {
                const key = `${fc.name}-${JSON.stringify(fc.args || {})}`;
                if (seenToolCalls.has(key)) return false;
                seenToolCalls.add(key);
                return true;
              });

              if (newCalls.length > 0) {
                hasOutput = true;
                yield { 
                  type: 'tool_call', 
                  delta: newCalls.map((fc: any, index: number) => ({
                    index: seenToolCalls.size - newCalls.length + index,
                    id: fc.id || `call_${Date.now()}_${index}`,
                    function: { name: fc.name, arguments: typeof fc.args === 'string' ? repairJSON(fc.args) : JSON.stringify(fc.args || {}) }
                  }))
                };
              }
            }
          } catch (e) {}
          
          if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
            yield { type: 'text', content: `\n\n[内容生成中止，原因: ${finishReason}]\n\n` };
          }
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (errMsg.includes('resource_exhausted') || errMsg.includes('Quota exceeded') || errMsg.includes('429')) {
          throw new Error('Gemini API 配额已超限（Quota Exceeded）。请检查您的 Google AI Studio 账户额度或切换至其他模型/API Key。');
        }
        throw err;
      }
      return;
    }

    if (protocol === Protocol.ANTHROPIC) {
      // Existing Anthropic logic from llm.ts
      const url = settings.apiUrl.trim().replace(/\/+$/, '') + '/messages';
      const rawTools = await getToolDefinitions(settings);
      const anthropicTools = rawTools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      }));

      const anthropicMessages: any[] = [];
      for (const m of processedMessages) {
        if (m.role === 'user') {
          const content: any[] = [];
          if (m.content) content.push({ type: 'text', text: m.content });
          if (m.attachments) {
            for (const at of m.attachments) {
              const [header, base64] = at.url.split(',');
              const mediaType = header.split(':')[1].split(';')[0];
              
              if (at.type.startsWith('image/')) {
                content.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64
                  }
                });
              } else if (at.type === 'application/pdf') {
                content.push({
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64
                  }
                });
              } else {
                content.push({ type: 'text', text: `\n[文件附件: ${at.name} (${at.type})]\n` });
              }
            }
          }
          anthropicMessages.push({ role: 'user', content: content.length > 1 ? content : m.content });
        }
        else if (m.role === 'assistant') {
          const content: any[] = [];
          if (m.content) content.push({ type: 'text', text: m.content });
          if (m.tool_calls) {
            m.tool_calls.forEach(tc => {
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: safeParseJSON(tc.function.arguments, {})
              });
            });
          }
          anthropicMessages.push({ role: 'assistant', content });
        } else if (m.role === 'tool') {
          const lastMsg = anthropicMessages[anthropicMessages.length - 1];
          const toolResult = { type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content };
          if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
            lastMsg.content.push(toolResult);
          } else {
            anthropicMessages.push({ role: 'user', content: [toolResult] });
          }
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'dangerously-set-forbidden-header': 'true'
        },
        body: JSON.stringify({
          model: settings.model || 'claude-3-5-sonnet-20241022',
          system: finalSystemPrompt,
          messages: anthropicMessages,
          max_tokens: settings.maxTokens || 4096,
          temperature: settings.temperature,
          stream: true,
          tools: anthropicTools.length > 0 ? anthropicTools : undefined
        }),
        signal
      });

      if (!response.ok) {
        const error = await parseError(response);
        throw new Error(error.message);
      }

      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';

      const anthropicPendingToolCalls: Record<number, any> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_delta') {
              if (data.delta?.type === 'text_delta') yield { type: 'text', content: data.delta.text };
              else if (data.delta?.type === 'input_json_delta') {
                const idx = data.index;
                if (!anthropicPendingToolCalls[idx]) {
                  anthropicPendingToolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                }
                anthropicPendingToolCalls[idx].function.arguments += data.delta.partial_json;
              }
            } else if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
              const idx = data.index;
              anthropicPendingToolCalls[idx] = { 
                id: data.content_block.id, 
                type: 'function', 
                function: { name: data.content_block.name, arguments: '' } 
              };
            }
          } catch (e) {}
        }
      }

      // Yield all collected tool calls after merging is complete
      for (const idx in anthropicPendingToolCalls) {
        const call = anthropicPendingToolCalls[idx];
        call.function.arguments = repairJSON(call.function.arguments || '{}');
        yield { 
          type: 'tool_call', 
          delta: [{
            ...call,
            index: Number(idx)
          }] 
        };
      }
      return;
    }

    // Default OpenAI logic
    let baseUrl = settings.apiUrl.trim().replace(/\/+$/, '');
    if (!baseUrl.endsWith('/v1') && !baseUrl.includes('/chat/completions')) baseUrl += '/v1';
    const url = baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    const rawTools = await getToolDefinitions(settings);

    const apiMessages = [];
    if (finalSystemPrompt) apiMessages.push({ role: 'system', content: finalSystemPrompt });
    
    for (const m of processedMessages) {
      let content: any = m.content;
      if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
        const contentArr: any[] = [];
        if (m.content) contentArr.push({ type: 'text', text: m.content });
        for (const at of m.attachments) {
          if (at.type.startsWith('image/')) {
            contentArr.push({
              type: 'image_url',
              image_url: { url: at.url }
            });
          } else {
            contentArr.push({ type: 'text', text: `\n[文件附件: ${at.name} (${at.type})]\n` });
          }
        }
        content = contentArr;
      }

      apiMessages.push({
        role: m.role,
        content,
        tool_calls: m.tool_calls?.map((tc: any) => ({
          ...tc,
          type: tc.type || 'function',
          function: tc.function ? {
            ...tc.function,
            arguments: repairJSON(tc.function.arguments)
          } : undefined
        })),
        tool_call_id: m.tool_call_id,
        name: m.name
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-3.5-turbo',
        messages: apiMessages,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        stream: true,
        tools: rawTools.length > 0 ? rawTools.map(t => ({ type: 'function', function: t })) : undefined,
        tool_choice: 'auto',
      }),
      signal
    });

    if (!response.ok) {
      const error = await parseError(response);
      throw new Error(error.message);
    }

    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';

    const pendingToolCalls: Record<number, any> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          const delta = data.choices?.[0]?.delta;
          if (delta?.content) yield { type: 'text', content: delta.content };
          if (delta?.tool_calls) {
            for (const dtc of delta.tool_calls) {
              const idx = dtc.index;
              if (!pendingToolCalls[idx]) {
                pendingToolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
              }
              if (dtc.id) pendingToolCalls[idx].id = dtc.id;
              if (dtc.function?.name) pendingToolCalls[idx].function.name = dtc.function.name;
              if (dtc.function?.arguments) pendingToolCalls[idx].function.arguments += dtc.function.arguments;
            }
          }
        } catch (e) {}
      }
    }

    // Yield all collected tool calls after merging is complete
    for (const idx in pendingToolCalls) {
      const call = pendingToolCalls[idx];
      // Final validation and repair before yielding
      call.function.arguments = repairJSON(call.function.arguments || '{}');
      yield { 
        type: 'tool_call', 
        delta: [{
          ...call,
          index: Number(idx)
        }] 
      };
    }
  }
}
