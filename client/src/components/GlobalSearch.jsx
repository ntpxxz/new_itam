import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../api.js';
import { useDebounced } from '../hooks.js';
import { StatusChip } from './ui.jsx';
import { OrderChip } from '../pages/Orders.jsx';

// Topbar search: type-ahead over devices, slips, orders, POs and people (GET /api/search).
// Enter with nothing highlighted searches the device register, like before.
const GlobalSearch = forwardRef(function GlobalSearch({ canRegister, placeholder, kbd }, ref) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const term = useDebounced(q.trim(), 250);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  useEffect(() => {
    if (term.length < 2) { setGroups([]); return undefined; }
    let live = true;
    setLoading(true);
    api.get('/api/search', { q: term })
      .then((d) => { if (live) { setGroups(d.groups); setActive(-1); } })
      .catch(() => { if (live) setGroups([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [term]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const options = groups.flatMap((g) => g.rows.map((row) => ({ ...row, group: g.key })));
  if (canRegister && q.trim()) options.push({ to: `/assets?q=${encodeURIComponent(q.trim())}`, all: true });

  const go = (opt) => {
    navigate(opt.to);
    setQ(''); setOpen(false); setGroups([]);
    inputRef.current?.blur();
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(-1, i - 1)); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[active] || options.find((o) => o.all) || (options.length === 1 ? options[0] : null);
      if (opt) go(opt);
    }
  };

  const show = open && q.trim().length > 0;
  const short = q.trim().length < 2;
  let i = -1;
  return (
    <div className="topbar-search" ref={boxRef}>
      <div className="input-icon">
        <Search size={16} aria-hidden />
        <input ref={inputRef} className="input" type="search" value={q} placeholder={placeholder}
          role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list" aria-label="ค้นหาในระบบ"
          aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
        {kbd && !q && <span className="kbd" aria-hidden>{kbd}</span>}
      </div>
      {show && (
        <div className="search-pop" id={listId} role="listbox" aria-label="ผลการค้นหา">
          {short && <div className="search-note">พิมพ์อย่างน้อย 2 ตัวอักษร</div>}
          {!short && loading && !groups.length && <div className="search-note">กำลังค้นหา…</div>}
          {!short && !loading && term === q.trim() && !groups.length && <div className="search-note">ไม่พบรายการที่ตรงกับ “{q.trim()}”</div>}
          {groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.label}>
              <div className="search-group">{g.label}</div>
              {g.rows.map((row) => {
                i += 1;
                const n = i;
                return (
                  <div key={row.to} id={`${listId}-${n}`} role="option" aria-selected={active === n}
                    className={`search-item${active === n ? ' active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(n)} onClick={() => go(row)}>
                    <span className="search-main">
                      <span className="search-title">{row.title}</span>
                      {(row.code || row.sub) && <span className="search-sub">{row.code && <span className="mono">{row.code}</span>}{row.code && row.sub && ' · '}{row.sub}</span>}
                    </span>
                    {row.status && <StatusChip status={row.status} />}
                    {row.order_status && <OrderChip status={row.order_status} />}
                  </div>
                );
              })}
            </div>
          ))}
          {canRegister && q.trim() && (() => {
            const n = options.length - 1;
            return (
              <div id={`${listId}-${n}`} role="option" aria-selected={active === n} className={`search-item search-all${active === n ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(n)} onClick={() => go(options[n])}>
                <Search size={14} aria-hidden />ค้นหา “{q.trim()}” ในทะเบียนอุปกรณ์ทั้งหมด
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
});

export default GlobalSearch;
