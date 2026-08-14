import { AppSettings } from '../types';
import { Protocol, detectProtocol } from './llm-engine';

export type SpeechSupportMode = 'cloud' | 'local' | 'none';

export class SpeechService {
  static hasLocalSupport(): boolean {
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  static async detectSupport(settings?: AppSettings): Promise<SpeechSupportMode> {
    const local = this.hasLocalSupport();

    if (!settings) {
      return local ? 'local' : 'none';
    }

    try {
      const protocol = await detectProtocol(settings);

      if (protocol === Protocol.GEMINI) {
        return 'cloud';
      }

      if (protocol === Protocol.ANTHROPIC) {
        return local ? 'local' : 'none';
      }

      // For OpenAI and Custom, we probe the /audio/transcriptions endpoint
      let baseUrl = settings.apiUrl.trim().replace(/\/+$/, '');
      if (baseUrl.includes('/chat/completions')) {
        baseUrl = baseUrl.replace('/chat/completions', '');
      } else if (!baseUrl.endsWith('/v1')) {
        baseUrl += '/v1';
      }
      
      const dummyBlob = new Blob([''], { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', dummyBlob, 'test.webm');
      formData.append('model', 'whisper-1');

      try {
        const res = await fetch(`${baseUrl}/audio/transcriptions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.apiKey}`
          },
          body: formData
        });
        
        // If it's 404, the endpoint definitely doesn't exist
        if (res.status === 404) {
          return local ? 'local' : 'none';
        }
        
        // 400, 401, 200, 500 etc. mean the server responded, so endpoint likely exists
        return 'cloud';
      } catch (e) {
        // If fetch fails (e.g. CORS), we assume cloud might be supported to be safe
        return 'cloud';
      }

    } catch (e) {
      return local ? 'local' : 'none';
    }
  }

  static getLocalRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;
    return recognition;
  }
}
