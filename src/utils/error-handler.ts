
/**
 * Centralized error handling utility for the application.
 */

export interface AppError {
  message: string;
  code?: string | number;
  details?: any;
  timestamp: number;
}

/**
 * Parses various error types into a consistent AppError format.
 */
export async function parseError(error: any): Promise<AppError> {
  const timestamp = Date.now();
  
  if (error instanceof Response) {
    let message = `API 错误: ${error.status} ${error.statusText}`;
    let details = null;
    
    try {
      const text = await error.text();
      try {
        const json = JSON.parse(text);
        message = json.error?.message || json.message || message;
        details = json;
      } catch {
        if (text) message += ` - ${text}`;
      }
    } catch {
      // Ignore error reading body
    }
    
    return {
      message,
      code: error.status,
      details,
      timestamp
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      timestamp
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      timestamp
    };
  }

  return {
    message: String(error) || '未知错误',
    timestamp
  };
}

/**
 * Formats an error for display in the UI.
 */
export function formatErrorMessage(error: any): string {
  if (!error) return '';
  
  // Handle specific common error messages or codes
  const message = error.message || String(error);
  
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return '网络连接失败，请检查您的网络设置或 API 地址是否正确。';
  }
  
  if (message.includes('API key not valid')) {
    return 'API 密钥无效，请在设置中检查您的 API 密钥。';
  }
  
  if (message.includes('model not found') || message.includes('Model not found')) {
    return '请求的模型未找到，请在设置中检查模型配置。';
  }

  if (message.includes('rate limit') || message.includes('429')) {
    return '请求过于频繁（速率限制），请稍后再试。';
  }

  if (message.includes('quota exceeded') || message.includes('Quota exceeded')) {
    return 'API 配额已耗尽，请检查您的账户额度。';
  }

  if (message.includes('blocked by safety')) {
    return '根据安全策略，该请求已被系统拦截。请尝试调整输入内容。';
  }

  if (message.includes('overloaded')) {
    return '模型当前正处于高负载状态，请稍后再试。';
  }

  // Fallback to original message if no specific match
  return message || '发生了一个未知错误。';
}
