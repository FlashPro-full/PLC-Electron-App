import { createContext, useCallback, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type Toast = {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
};

type ToastOptions = { type?: ToastType; duration?: number };

type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => string;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const toastConfig: Record<ToastType, { icon: ReactNode; bgColor: string; borderColor: string; textColor: string; iconColor: string; progressColor: string }> = {
  success: {
    icon: <CheckCircle2 className="w-5 h-5" />,
    bgColor: 'bg-white',
    borderColor: 'border-green-500',
    textColor: 'text-gray-900',
    iconColor: 'text-green-500',
    progressColor: 'bg-green-500',
  },
  error: {
    icon: <XCircle className="w-5 h-5" />,
    bgColor: 'bg-white',
    borderColor: 'border-red-500',
    textColor: 'text-gray-900',
    iconColor: 'text-red-500',
    progressColor: 'bg-red-500',
  },
  info: {
    icon: <Info className="w-5 h-5" />,
    bgColor: 'bg-white',
    borderColor: 'border-blue-500',
    textColor: 'text-gray-900',
    iconColor: 'text-blue-500',
    progressColor: 'bg-blue-500',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    bgColor: 'bg-white',
    borderColor: 'border-amber-500',
    textColor: 'text-gray-900',
    iconColor: 'text-amber-500',
    progressColor: 'bg-amber-500',
  },
};

const ToastItem = ({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) => {
  const [progress, setProgress] = useState(100);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (toast.duration <= 0) return;

    const startTime = Date.now();
    startTimeRef.current = startTime;
    const interval = 50;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        setIsExiting(true);
        setTimeout(() => onDismiss(toast.id), 300);
      }
    };

    progressRef.current = setInterval(updateProgress, interval);

    timerRef.current = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [toast.duration, toast.id, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const config = toastConfig[toast.type];

  return (
    <div
      className={`pointer-events-auto relative flex items-start gap-3 rounded-xl border-l-4 ${config.bgColor} ${config.borderColor} shadow-xl px-5 py-4 min-w-[320px] max-w-md transition-all duration-300 ease-out ${
        isExiting ? 'opacity-0 translate-x-full scale-95' : 'opacity-100 translate-x-0 scale-100'
      }`}
      style={{
        animation: isExiting ? 'none' : 'slideInRight 0.3s ease-out',
      }}
      role="alert"
    >
      <div className={`shrink-0 mt-0.5 ${config.iconColor}`}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${config.textColor} leading-relaxed`}>
          {toast.message}
        </p>
        {toast.duration > 0 && (
          <div className="mt-3 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${config.progressColor}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 -mt-1 -mr-1 p-1.5 rounded-lg hover:bg-gray-100 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-gray-500" />
      </button>
    </div>
  );
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options?: ToastOptions): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const type = options?.type ?? 'info';
      const duration = options?.duration ?? 5000;
      const toast: Toast = { id, message, type, duration };
      setToasts((prev) => [...prev, toast]);
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
      return id;
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[9999] flex flex-col gap-3">
        <style>{`
          @keyframes slideInRight {
            from {
              opacity: 0;
              transform: translateX(100%) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateX(0) scale(1);
            }
          }
        `}</style>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
