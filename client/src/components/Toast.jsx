import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastCtx = createContext(null);
let nextId = 1;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((xs) => xs.filter((t) => t.id !== id)), []);
  const push = useCallback((type, message, ms, action) => {
    const id = nextId++;
    // A repeated message replaces itself; a success clears earlier errors (the problem was fixed).
    setItems((xs) => [...xs.filter((t) => !(t.type === type && t.message === message) && !(type === 'success' && t.type === 'error')).slice(-3), { id, type, message, action }]);
    // Errors stay until closed so a long Thai message can be read in full.
    if (type !== 'error') setTimeout(() => dismiss(id), ms ?? (action ? 6000 : 3500));
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m?.message || m),
    info: (m) => push('info', m),
    // toast.undo('ลบรายการแล้ว', () => restore()) — info toast with a เลิกทำ button.
    undo: (m, onUndo) => push('info', m, undefined, { label: 'เลิกทำ', onClick: onUndo }),
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
              <I size={20} aria-hidden />
              <div>{t.message}</div>
              {t.action && (
                <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { dismiss(t.id); t.action.onClick(); }}>{t.action.label}</button>
              )}
              <button className="icon-btn plain close" style={{ width: 32, height: 32 }} onClick={() => dismiss(t.id)} aria-label="ปิดข้อความ">
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
