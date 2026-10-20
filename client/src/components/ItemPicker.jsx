import { useEffect, useRef, useState } from 'react';
import { ScanLine, Laptop, Package } from 'lucide-react';
import { api } from '../api.js';
import { useDebounced } from '../hooks.js';
import { StatusChip } from './ui.jsx';
import { fmtNum } from '../format.js';

const extractCode = (t) => { const m = String(t).match(/\/a\/([^/?#\s]+)/); return m ? decodeURIComponent(m[1]) : String(t).trim(); };

// Search-or-scan box over /api/items. `accept(row)` decides which rows can be picked;
// pressing Enter on an exact code/serial match (e.g. from a USB barcode scanner) picks it immediately.
export default function ItemPicker({ onPick, accept = () => true, reason = () => '', placeholder, autoFocus }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    const term = extractCode(dq);
    if (!term) { setRows([]); return; }
    let live = true;
    api.get('/api/items', { q: term, pageSize: 12, sort: 'name', dir: 'asc' }).then((d) => { if (live) { setRows(d.rows); setActive(0); } }).catch(() => {});
    return () => { live = false; };
  }, [dq]);

  useEffect(() => {
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (r) => {
    if (!accept(r)) return;
    onPick(r);
    setQ(''); setRows([]); setOpen(false);
    input.current?.focus();
  };

  const onKey = async (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); setOpen(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter') {
      e.preventDefault();
      const term = extractCode(q).toLowerCase();
      if (!term) return;
      // Scanner path: fetch fresh so a fast scan isn't waiting on the debounce.
      const fresh = rows.length && extractCode(dq).toLowerCase() === term ? rows : (await api.get('/api/items', { q: term, pageSize: 12 }).catch(() => ({ rows: [] }))).rows;
      const exact = fresh.find((r) => r.code.toLowerCase() === term || (r.serial_no || '').toLowerCase() === term);
      const target = exact || (open ? fresh[active] : null) || (fresh.length === 1 ? fresh[0] : null);
      if (target) pick(target);
      else { setRows(fresh); setOpen(true); }
    }
  };

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <div className="input-icon">
        <ScanLine size={16} aria-hidden />
        <input ref={input} className="input" value={q} autoFocus={autoFocus} placeholder={placeholder || 'สแกนหรือพิมพ์รหัส / ชื่อ / Serial แล้วกด Enter'}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={open && rows.length > 0} aria-autocomplete="list" aria-label="ค้นหารายการ" />
      </div>
      {open && q && rows.length > 0 && (
        <div className="menu" role="listbox" style={{ left: 0, right: 0, maxHeight: 340, overflowY: 'auto' }}>
          {rows.map((r, i) => {
            const ok = accept(r);
            return (
              <button key={`${r.kind}${r.id}`} type="button" role="option" aria-selected={i === active} aria-disabled={!ok}
                onMouseEnter={() => setActive(i)} onClick={() => pick(r)}
                style={{ background: i === active ? 'var(--bg-subtle)' : undefined, opacity: ok ? 1 : 0.5, cursor: ok ? 'pointer' : 'not-allowed', whiteSpace: 'normal' }}>
                <span className="thumb" style={{ width: 30, height: 30 }}>{r.kind === 'asset' ? <Laptop size={14} /> : <Package size={14} />}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="cell-main" style={{ display: 'block' }}>{r.name}</span>
                  <span className="tag">{r.code}{r.serial_no && ` · SN ${r.serial_no}`} · {r.category_name}</span>
                  {!ok && reason(r) && <span className="cell-sub danger-text" style={{ display: 'block' }}>{reason(r)}</span>}
                </span>
                <span style={{ textAlign: 'right' }}>
                  {r.kind === 'consumable' ? <span className="mono" style={{ fontSize: 12 }}>{fmtNum(r.qty_on_hand)} {r.unit}</span> : <StatusChip status={r.status} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
