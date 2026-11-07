import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Laptop, ArrowLeftRight, History, PackagePlus, PackageMinus, BarChart3, ScanLine, Printer, ClipboardCheck, FileSpreadsheet,
  Users, Database, UserCog, ShieldCheck, ScrollText, Settings, Menu as MenuIcon, Search, LogOut, KeyRound, Boxes,
  ClipboardList, ShoppingCart, ReceiptText,
} from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { initials } from '../format.js';
import { useCart } from '../cart.js';
import NotificationBell from './NotificationBell.jsx';
import { Menu } from './ui.jsx';
import AssistantChat from './AssistantChat.jsx';

const NAV = [
  { label: 'ภาพรวม', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view', end: true }] },
  {
    label: 'ทรัพย์สิน',
    items: [
      { to: '/assets', label: 'อุปกรณ์', icon: Laptop, perm: ['asset.view', 'consumable.view'], badge: 'lowStock' },
      { to: '/receive', label: 'รับเข้า', icon: PackagePlus, perm: ['asset.create', 'consumable.move'] },
      { to: '/pending-receive', label: 'รอรับเข้า', icon: ClipboardList, perm: 'consumable.view', badge: 'pendingReceive' },
      { to: '/issue', label: 'เบิกออก', icon: PackageMinus, perm: ['asset.transact', 'consumable.move'] },
      { to: '/loans', label: 'ยืม-คืน', icon: ArrowLeftRight, perm: 'loan.view', badge: 'overdue' },
      { to: '/history', label: 'ประวัติรายการ', icon: History, perm: 'history.view' },
    ],
  },
  {
    label: 'สั่งซื้อ',
    items: [
      { to: '/shop', label: 'สั่งซื้อสินค้า', icon: ShoppingCart, perm: 'order.create' },
      { to: '/orders', label: 'ใบสั่งซื้อ', icon: ReceiptText, perm: ['order.create', 'order.manage'], badge: 'pendingOrders' },
    ],
  },
  {
    label: 'รายงาน',
    items: [{ to: '/reports/issues', label: 'สรุปการเบิกตามแผนก', icon: BarChart3, perm: 'report.view' }],
  },
  {
    label: 'เครื่องมือ',
    items: [
      { to: '/scan', label: 'สแกน QR', icon: ScanLine, perm: 'scan.use' },
      { to: '/labels', label: 'พิมพ์สติ๊กเกอร์', icon: Printer, perm: 'label.print' },
      { to: '/stock-counts', label: 'ตรวจนับ', icon: ClipboardCheck, perm: 'stockcount.manage' },
      { to: '/import', label: 'นำเข้า Excel', icon: FileSpreadsheet, perm: 'data.import' },
    ],
  },
  {
    label: 'ตั้งค่า',
    items: [
      { to: '/people', label: 'พนักงาน', icon: Users, perm: 'people.view' },
      { to: '/master', label: 'ข้อมูลหลัก', icon: Database, perm: 'master.manage' },
      { to: '/admin/users', label: 'ผู้ใช้งาน', icon: UserCog, perm: 'user.manage' },
      { to: '/admin/roles', label: 'บทบาทและสิทธิ์', icon: ShieldCheck, perm: 'role.manage' },
      { to: '/logs', label: 'Log การใช้งาน', icon: ScrollText, perm: 'log.view' },
      { to: '/settings', label: 'ตั้งค่าระบบ', icon: Settings, perm: 'settings.manage' },
    ],
  },
];

export default function Layout() {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState({ overdue: 0, lowStock: 0, pendingReceive: 0, pendingOrders: 0, notifications: 0 });
  const [q, setQ] = useState('');
  const cart = useCart();
  const searchRef = useRef(null);
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  const loadBadges = () => api.get('/api/dashboard/badges').then(setBadges).catch(() => {});
  useEffect(() => { loadBadges(); }, [loc.pathname]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) loadBadges(); }, 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    navigate(`/assets?q=${encodeURIComponent(term)}`);
    setQ('');
    searchRef.current?.blur();
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <aside className="sidebar" aria-label="เมนูหลัก">
        <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="brand-mark"><Boxes size={18} aria-hidden /></span>
          <span>
            <div className="brand-name">IT Store</div>
            <div className="brand-sub">ระบบจัดการทรัพย์สินไอที</div>
          </span>
        </Link>
        <nav>
          {NAV.map((sec) => {
            const items = sec.items.filter((i) => [i.perm].flat().some(can));
            if (!items.length) return null;
            return (
              <div className="nav-section" key={sec.label}>
                <div className="nav-label">{sec.label}</div>
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                    <i.icon size={16} aria-hidden />
                    <span>{i.label}</span>
                    {i.badge && badges[i.badge] > 0 && (
                      <span className={`nav-badge${i.badge === 'lowStock' ? ' warn' : ''}`}
                        aria-label={{ overdue: `เกินกำหนดคืน ${badges.overdue} รายการ`, lowStock: `สต็อกต่ำ ${badges.lowStock} รายการ`, pendingReceive: `รอรับเข้า ${badges.pendingReceive} รายการ`, pendingOrders: `ใบสั่งซื้อรอดำเนินการ ${badges.pendingOrders} รายการ` }[i.badge]}>
                        {badges[i.badge]}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="user-card">
            <span className="avatar" aria-hidden>{initials(user.full_name)}</span>
            <div className="user-meta">
              <div className="n">{user.full_name}</div>
              <div className="r">{user.role_name}</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden />

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn hamburger" onClick={() => setOpen(true)} aria-label="เปิดเมนู" aria-expanded={open}>
            <MenuIcon size={18} />
          </button>
          {can('asset.view') || can('consumable.view') ? (
            <form className="topbar-search input-icon" onSubmit={submitSearch} role="search">
              <Search size={16} aria-hidden />
              <input ref={searchRef} className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหารหัสทรัพย์สิน, Serial, ชื่อ, ผู้ถือครอง" aria-label="ค้นหาอุปกรณ์" />
              <span className="kbd" aria-hidden>{isMac ? '⌘K' : 'Ctrl K'}</span>
            </form>
          ) : <div className="spacer" />}
          {can('order.create') && (
            <Link to="/cart" className="icon-btn" aria-label={cart.length ? `ตะกร้า ${cart.length} รายการ` : 'ตะกร้า'} title="ตะกร้า">
              <ShoppingCart size={18} />{cart.length > 0 && <span className="count mono" aria-hidden>{cart.length}</span>}
            </Link>
          )}
          {can('asset.view') && (
            <Link to="/scan" className="icon-btn" aria-label="สแกน QR" title="สแกน QR"><ScanLine size={18} /></Link>
          )}
          <NotificationBell badges={badges} onChange={loadBadges} />
          <Menu
            label="บัญชีผู้ใช้"
            icon={<span className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{initials(user.full_name)}</span>}
            items={[
              { label: 'เปลี่ยนรหัสผ่าน', to: '/profile', icon: <KeyRound size={15} /> },
              '-',
              { label: 'ออกจากระบบ', onClick: logout, icon: <LogOut size={15} />, danger: true },
            ]}
          />
        </header>
        <main className="content" id="main">
          <Outlet />
        </main>
        <AssistantChat />
      </div>
    </div>
  );
}
