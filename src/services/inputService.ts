export interface InputOptions {
  inputType?: string;
  options?: string[];
  title?: string;
  placeholder?: string;
}

export interface InputRequest {
  id: string;
  prompt: string;
  inputType?: string;
  options?: string[];
  title?: string;
  placeholder?: string;
  resolve: (value: string) => void;
}

type InputListener = (request: InputRequest | null) => void;

let currentListener: InputListener | null = null;
let currentRequest: InputRequest | null = null;

export const setInputListener = (listener: InputListener) => {
  currentListener = listener;
  // 如果在设置监听前已有请求挂起，立即通知
  if (currentRequest && currentListener) {
    currentListener(currentRequest);
  }
};

export const requestCustomInput = (
  promptMsg: string,
  opts?: InputOptions
): Promise<string> => {
  return new Promise((resolve) => {
    const request: InputRequest = {
      id: Math.random().toString(36).substring(2),
      prompt: promptMsg || '请输入内容：',
      inputType: opts?.inputType || 'text',
      options: opts?.options,
      title: opts?.title,
      placeholder: opts?.placeholder,
      resolve: (val: string) => {
        currentRequest = null;
        if (currentListener) currentListener(null);
        resolve(val);
      }
    };

    currentRequest = request;

    if (currentListener) {
      currentListener(request);
    } else {
      // 备用：若无 React UI 监听，退回原生的 prompt 弹窗
      console.warn('CustomInputDialog is not mounted.');
      const val = '';
      currentRequest = null;
      resolve(val !== null ? val : '');
    }
  });
};

// 挂载到全局 window
if (typeof window !== 'undefined') {
  (window as any).showCustomInputDialog = (promptMsg: string, opts?: InputOptions) => {
    return requestCustomInput(promptMsg, opts);
  };
}
