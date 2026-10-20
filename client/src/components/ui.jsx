import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, MoreHorizontal, ChevronLeft, ChevronRight, Inbox, ChevronUp, ChevronDown } from 'lucide-react';
import { fmtNum } from '../format.js';

export const STATUS = {
  available: 'พร้อมใช้',
  borrowed: 'ถูกยืม',
  issued: 'เบิกถาวร',
  repair: 'กำลังซ่อม',
  pending_disposal: 'รอจำหน่าย',
  scrapped: 'Scrap',
};
export const STATUS_ORDER = ['available', 'borrowed', 'issued', 'repair', 'pending_disposal', 'scrapped'];
export const STATUS_DOT = {
  available: 'var(--success)', borrowed: 'var(--brand)', issued: 'var(--brand)',
  repair: 'var(--warning)', pending_disposal: 'var(--neutral)', scrapped: 'var(--danger)',
};

// Quantity-tracked items (consumable categories)
export const STOCK = {
  in_stock: ['มีในสต็อก', 'available'],
  low_stock: ['ต่ำกว่าจุดสั่งซื้อ', 'danger'],
  out_of_stock: ['หมด', 'scrapped'],
};

export function StatusChip({ status }) {
  if (STOCK[status]) return <span className={`chip chip-${STOCK[status][1]}`}>{STOCK[status][0]}</span>;
  return <span className={`chip chip-${status}`}>{STATUS[status] || status}</span>;
}

export const KIND_LABEL = { asset: 'รายชิ้น', consumable: 'นับจำนวน' };

// Category picker grouped by tracking type
export function CategorySelect({ value, onChange, categories, placeholder = '— เลือกหมวดหมู่ —', ...rest }) {
  const groups = [['asset', 'อุปกรณ์รายชิ้น (มีรหัสทรัพย์สิน)'], ['consumable', 'นับจำนวน (วัสดุสิ้นเปลือง)']];
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="">{placeholder}</option>
      {groups.map(([kind, label]) => {
        const list = categories.filter((c) => c.kind === kind);
        return list.length ? (
          <optgroup key={kind} label={label}>
            {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

export function Chip({ tone = 'neutral', children, dot = true }) {
  return <span className={`chip chip-${tone}${dot ? '' : ' no-dot'}`}>{children}</span>;
}

export function PageHeader({ title, sub, crumbs, children }) {
  return (
    <div className="page-head">
      <div className="titles">
        {crumbs && (
          <nav className="crumbs" aria-label="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6 }}>
                {i > 0 && <span aria-hidden>/</span>}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="row-wrap">{children}</div>}
    </div>
  );
}

export function Card({ title, actions, children, foot, bodyClass = 'card-body', className = '', noBody }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2 className="section-title">{title}</h2>}
          {actions}
        </div>
      )}
      {noBody ? children : <div className={bodyClass}>{children}</div>}
      {foot && <div className="card-foot">{foot}</div>}
    </section>
  );
}

export function Modal({ title, onClose, children, footer, wide, initialFocus = true }) {
  const ref = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = [...f].filter((el) => !el.disabled && el.offsetParent !== null);
        if (!list.length) return;
        if (e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    if (initialFocus) setTimeout(() => ref.current?.querySelector('input:not([type=hidden]), select, textarea')?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [initialFocus]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn plain" onClick={onClose} aria-label="ปิด"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'ยืนยัน', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} footer={(
      <>
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>
          {confirmLabel}
        </button>
      </>
    )}>
      <p>{message}</p>
    </Modal>
  );
}

export function Field({ label, required, hint, error, children, className = '' }) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children, { id: children.props.id || id, 'aria-invalid': error ? 'true' : undefined })
    : children;
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={id}>{label}{required && <span className="req" aria-hidden>*</span>}</label>}
      {child}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder = '— เลือก —', allowEmpty = true, ...rest }) {
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Menu({ label = 'การทำงานเพิ่มเติม', items, icon, buttonClass = 'icon-btn plain' }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const visible = items.filter(Boolean);
  if (!visible.length) return null;
  return (
    <div className="menu-wrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className={buttonClass} aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { setUp(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < 220); setOpen((o) => !o); }}>
        {icon || <MoreHorizontal size={18} />}
      </button>
      {open && (
        <div className={`menu${up ? ' up' : ''}`} role="menu">
          {visible.map((it, i) => (it === '-' ? <hr key={i} /> : it.to ? (
            <Link key={i} to={it.to} role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => setOpen(false)}>{it.icon}{it.label}</Link>
          ) : (
            <button key={i} role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>{it.icon}{it.label}</button>
          )))}
        </div>
      )}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p);
  return (
    <nav className="pager" aria-label="เปลี่ยนหน้า">
      <span className="info">แสดง <span className="mono">{fmtNum(from)}–{fmtNum(to)}</span> จาก <span className="mono">{fmtNum(total)}</span> รายการ</span>
      <button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="หน้าก่อนหน้า"><ChevronLeft size={14} /></button>
      {nums[0] > 1 && <><button onClick={() => onPage(1)}>1</button>{nums[0] > 2 && <span className="subtle">…</span>}</>}
      {nums.map((p) => <button key={p} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>)}
      {nums.at(-1) < pages && <>{nums.at(-1) < pages - 1 && <span className="subtle">…</span>}<button onClick={() => onPage(pages)}>{pages}</button></>}
      <button onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="หน้าถัดไป"><ChevronRight size={14} /></button>
    </nav>
  );
}

export function Empty({ icon: Icon = Inbox, title = 'ไม่มีข้อมูล', children }) {
  return (
    <div className="empty">
      <Icon size={32} aria-hidden />
      <div className="t">{title}</div>
      {children && <div style={{ fontSize: 13 }}>{children}</div>}
    </div>
  );
}

export function Loading({ rows = 5 }) {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }} aria-busy="true" aria-label="กำลังโหลด">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ width: `${90 - (i % 3) * 15}%` }} />)}
    </div>
  );
}

export function SortHeader({ label, field, sort, dir, onSort }) {
  const active = sort === field;
  return (
    <th aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(field, active && dir === 'desc' ? 'asc' : 'desc')}>
        {label}
        {active && (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </button>
    </th>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  );
}
