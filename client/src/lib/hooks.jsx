import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleCheck, TriangleAlert, Bell, X } from 'lucide-react';
import { api } from './api.js';
import { cx } from './format.js';

/** Loads data from the API. Returns { data, error, loading, reload }. */
export function useApi(path, query) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const key = path ? `${path}?${JSON.stringify(query ?? {})}` : null;
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const call = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { query });
      if (call === latest.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (call === latest.current) setState((s) => ({ ...s, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

// ---- toasts
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

const ICONS = { success: CircleCheck, error: TriangleAlert, alert: Bell };
const TONES = { success: 'text-brand-600', error: 'text-red-600', alert: 'text-amber-600' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (message, { type = 'success', title, duration = 4500 } = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list.slice(-3), { id, message, type, title }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-5" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] ?? CircleCheck;
          return (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-card">
              <Icon className={cx('mt-0.5 size-5 shrink-0', TONES[t.type])} />
              <div className="min-w-0 flex-1 text-sm">
                {t.title && <p className="font-semibold">{t.title}</p>}
                <p className="text-ink-2">{t.message}</p>
              </div>
              <button onClick={() => dismiss(t.id)} className="rounded-md p-0.5 text-ink-3 hover:bg-canvas" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Shows budget alerts returned by a write request as toasts. */
export function useAlertToasts() {
  const toast = useToast();
  return useCallback(
    (alerts = []) => alerts.forEach((a) => toast(a.message, { type: 'alert', title: a.title, duration: 8000 })),
    [toast],
  );
}
