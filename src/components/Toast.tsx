'use client';

import { useCallback, useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

const icons: Record<ToastType, string> = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

const colors: Record<ToastType, string> = {
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

export function Toast({ message, type = 'info', visible, onHide, duration = 4000 }: ToastProps) {
  const [animOut, setAnimOut] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAnimOut(false);
    const timer = setTimeout(() => {
      setAnimOut(true);
      setTimeout(onHide, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onHide]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-20 left-1/2 z-[200] px-5 py-3 rounded-full shadow-xl flex items-center gap-2.5 max-w-[340px] w-max
        bg-[#1c1917] text-[#f5f5f4] dark:bg-[#f5f5f4] dark:text-[#1c1917]
        ${animOut ? 'toast-exit' : 'toast-enter'}`}
      style={{ transform: 'translateX(-50%)' }}
    >
      <span
        className={`material-symbols-outlined text-[20px] ${colors[type]}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {icons[type]}
      </span>
      <span className="text-sm font-semibold leading-snug whitespace-pre-wrap">{message}</span>
    </div>
  );
}

// Hook for easy toast management
export function useToast() {
  const [state, setState] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'info',
    visible: false,
  });

  const show = useCallback((message: string, type: ToastType = 'info') => {
    setState({ message, type, visible: true });
  }, []);

  const hide = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  const toastEl = (
    <Toast message={state.message} type={state.type} visible={state.visible} onHide={hide} />
  );

  return { show, hide, toastEl };
}
