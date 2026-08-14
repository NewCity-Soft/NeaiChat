export interface DialogOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

export interface ConfirmRequest {
  id: string;
  message: string;
  options?: DialogOptions;
  resolve: (value: boolean) => void;
}

export interface AlertRequest {
  id: string;
  message: string;
  options?: DialogOptions;
  resolve: () => void;
}

type ConfirmListener = (request: ConfirmRequest | null) => void;
let currentConfirmListener: ConfirmListener | null = null;
let pendingConfirmRequest: ConfirmRequest | null = null;

export const setConfirmListener = (listener: ConfirmListener) => {
  currentConfirmListener = listener;
  if (pendingConfirmRequest && currentConfirmListener) {
    currentConfirmListener(pendingConfirmRequest);
  }
};

export const customConfirm = (message: string, options?: DialogOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    const request: ConfirmRequest = {
      id: Math.random().toString(36).substring(2),
      message,
      options,
      resolve: (val: boolean) => {
        pendingConfirmRequest = null;
        if (currentConfirmListener) currentConfirmListener(null);
        resolve(val);
      }
    };
    pendingConfirmRequest = request;
    if (currentConfirmListener) {
      currentConfirmListener(request);
    }
  });
};

type AlertListener = (request: AlertRequest | null) => void;
let currentAlertListener: AlertListener | null = null;
let pendingAlertRequest: AlertRequest | null = null;

export const setAlertListener = (listener: AlertListener) => {
  currentAlertListener = listener;
  if (pendingAlertRequest && currentAlertListener) {
    currentAlertListener(pendingAlertRequest);
  }
};

export const customAlert = (message: string, options?: DialogOptions): Promise<void> => {
  return new Promise((resolve) => {
    const request: AlertRequest = {
      id: Math.random().toString(36).substring(2),
      message,
      options,
      resolve: () => {
        pendingAlertRequest = null;
        if (currentAlertListener) currentAlertListener(null);
        resolve();
      }
    };
    pendingAlertRequest = request;
    if (currentAlertListener) {
      currentAlertListener(request);
    }
  });
};
