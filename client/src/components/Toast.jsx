import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastCtx = createContext(null);
let nextId = 1;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((xs) => xs.filter((t) => t.id !== id)), []);
  const push = useCallback((type, message, ms) => {
    const id = nextId++;
    setItems((xs) => [...xs.slice(-3), { id, type, message }]);
    setTimeout(() => dismiss(id), ms ?? (type === 'error' ? 7000 : 3500));
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m?.message || m),
    info: (m) => push('info', m),
  }), [push]);

  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.type];
          return (
            <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : undefined}>
              <I size={18} aria-hidden />
              <div>{t.message}</div>
              <button className="icon-btn plain close" style={{ width: 24, height: 24 }} onClick={() => dismiss(t.id)} aria-label="ปิดข้อความ">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
