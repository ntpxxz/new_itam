import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Laptop, ArrowLeftRight, History, PackagePlus, PackageMinus, BarChart3, ScanLine, Printer, ClipboardCheck, FileSpreadsheet,
  Users, Database, UserCog, ShieldCheck, ScrollText, Settings, Menu as MenuIcon, Search, Bell, LogOut, KeyRound, Boxes,
  AlertTriangle, PackageX,
} from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { initials } from '../format.js';
import { Menu } from './ui.jsx';

const NAV = [
  { label: 'ภาพรวม', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view', end: true }] },
  {
    label: 'ทรัพย์สิน',
    items: [
      { to: '/assets', label: 'อุปกรณ์', icon: Laptop, perm: ['asset.view', 'consumable.view'], badge: 'lowStock' },
      { to: '/receive', label: 'รับเข้า', icon: PackagePlus, perm: ['asset.create', 'consumable.move'] },
      { to: '/issue', label: 'เบิกออก', icon: PackageMinus, perm: ['asset.transact', 'consumable.move'] },
      { to: '/loans', label: 'ยืม-คืน', icon: ArrowLeftRight, perm: 'asset.view', badge: 'overdue' },
      { to: '/history', label: 'ประวัติรายการ', icon: History, perm: 'asset.view' },
    ],
  },
  {
    label: 'รายงาน',
    items: [{ to: '/reports/issues', label: 'สรุปการเบิกตามแผนก', icon: BarChart3, perm: 'report.view' }],
  },
  {
    label: 'เครื่องมือ',
    items: [
      { to: '/scan', label: 'สแกน QR', icon: ScanLine, perm: 'asset.view' },
      { to: '/labels', label: 'พิมพ์สติ๊กเกอร์', icon: Printer, perm: 'asset.view' },
      { to: '/stock-counts', label: 'ตรวจนับ', icon: ClipboardCheck, perm: 'stockcount.manage' },
      { to: '/import', label: 'นำเข้า Excel', icon: FileSpreadsheet, perm: 'data.import' },
    ],
  },
  {
    label: 'ตั้งค่า',
    items: [
      { to: '/people', label: 'พนักงาน', icon: Users, perm: 'asset.view' },
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
  const [badges, setBadges] = useState({ overdue: 0, lowStock: 0 });
  const [q, setQ] = useState('');
  const searchRef = useRef(null);
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    api.get('/api/dashboard/badges').then(setBadges).catch(() => {});
  }, [loc.pathname]);
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

  const alertCount = badges.overdue + badges.lowStock;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <aside className="sidebar" aria-label="เมนูหลัก">
        <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="brand-mark"><Boxes size={18} aria-hidden /></span>
          <span>
            <div className="brand-name">AssetFlow</div>
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
                        aria-label={i.badge === 'overdue' ? `เกินกำหนดคืน ${badges.overdue} รายการ` : `สต็อกต่ำ ${badges.lowStock} รายการ`}>
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
          {can('asset.view') && (
            <Link to="/scan" className="icon-btn" aria-label="สแกน QR" title="สแกน QR"><ScanLine size={18} /></Link>
          )}
          <Menu
            buttonClass="icon-btn"
            label={alertCount ? `การแจ้งเตือน ${alertCount} รายการ` : 'การแจ้งเตือน'}
            icon={<><Bell size={18} />{alertCount > 0 && <span className="dot" aria-hidden />}</>}
            items={[
              badges.overdue > 0 && { label: `เกินกำหนดคืน ${badges.overdue} รายการ`, to: '/loans?filter=overdue', icon: <AlertTriangle size={15} /> },
              badges.lowStock > 0 && { label: `สต็อกต่ำ ${badges.lowStock} รายการ`, to: '/assets?status=low', icon: <PackageX size={15} /> },
              !alertCount && { label: 'ไม่มีรายการที่ต้องดำเนินการ', onClick: () => {} },
            ]}
          />
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
      </div>
    </div>
  );
}
