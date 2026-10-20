import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './api.js';
import { useToast } from './components/Toast.jsx';

// Fetch helper: { data, loading, error, reload }
export function useApi(url, params, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const toast = useToast();
  const key = JSON.stringify([url, params]);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!url) return;
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    api.get(url, params)
      .then((data) => n === seq.current && setState({ data, loading: false, error: null }))
      .catch((error) => {
        if (n !== seq.current) return;
        setState({ data: null, loading: false, error });
        if (error.status !== 401) toast.error(error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

// Master data lists, cached for the session
const cache = {};
export function useLookup(table, params) {
  const k = table + JSON.stringify(params || {});
  const [rows, setRows] = useState(cache[k] || []);
  useEffect(() => {
    api.get(`/api/master/${table}`, params).then((d) => { cache[k] = d.rows; setRows(d.rows); }).catch(() => {});
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}
export const clearLookupCache = () => { for (const k of Object.keys(cache)) delete cache[k]; };

// Query-string backed state (filters survive reload/back)
export function useQueryState(defaults) {
  const [sp, setSp] = useSearchParams();
  const state = { ...defaults };
  for (const k of Object.keys(defaults)) if (sp.has(k)) state[k] = sp.get(k);
  const set = useCallback((patch) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v === null || v === undefined || String(v) === String(defaults[k])) next.delete(k);
        else next.set(k, v);
      }
      if (!('page' in patch) && 'page' in defaults) next.delete('page');
      return next;
    }, { replace: true });
  }, [setSp]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, set];
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
