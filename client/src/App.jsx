import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Empty } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Assets from './pages/Assets.jsx';
import AssetForm from './pages/AssetForm.jsx';
import AssetDetail from './pages/AssetDetail.jsx';
import TagRedirect from './pages/TagRedirect.jsx';
import Loans from './pages/Loans.jsx';
import ConsumableDetail from './pages/ConsumableDetail.jsx';
import HistoryPage from './pages/History.jsx';
import ActivityPage from './pages/Activity.jsx';
import Scan from './pages/Scan.jsx';
import Labels from './pages/Labels.jsx';
import StockCounts from './pages/StockCounts.jsx';
import StockCountDetail from './pages/StockCountDetail.jsx';
import ImportPage from './pages/Import.jsx';
import People from './pages/People.jsx';
import MasterData from './pages/MasterData.jsx';
import UsersPage from './pages/Users.jsx';
import Roles from './pages/Roles.jsx';
import Logs from './pages/Logs.jsx';
import SettingsPage from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';
import Receive from './pages/Receive.jsx';
import PendingReceive from './pages/PendingReceive.jsx';
import Issue from './pages/Issue.jsx';
import DocumentDetail from './pages/DocumentDetail.jsx';
import Reports from './pages/Reports.jsx';
import Shop from './pages/Shop.jsx';
import Cart from './pages/Cart.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import PurchaseOrders from './pages/PurchaseOrders.jsx';
import PurchaseOrderNew from './pages/PurchaseOrderNew.jsx';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail.jsx';

function Guard({ perm, children }) {
  const { can } = useAuth();
  if (perm && ![perm].flat().some(can)) {
    return (
      <Empty icon={ShieldOff} title="คุณไม่มีสิทธิ์เข้าถึงหน้านี้">
        ติดต่อผู้ดูแลระบบหากต้องการใช้งานส่วนนี้
      </Empty>
    );
  }
  return children;
}

function Home() {
  const { can } = useAuth();
  if (can('dashboard.view')) return <Dashboard />;
  if (can('asset.view') || can('consumable.view')) return <Navigate to="/assets" replace />;
  if (can('order.create')) return <Navigate to="/shop" replace />;
  if (can('order.manage')) return <Navigate to="/orders" replace />;
  return <Navigate to="/profile" replace />;
}

export default function App() {
  const { user } = useAuth();
  const loc = useLocation();

  if (user === undefined) return <div className="center-page"><div className="spinner" aria-label="กำลังโหลด" /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />} />
      </Routes>
    );
  }

  const g = (perm, el) => <Guard perm={perm}>{el}</Guard>;
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="assets" element={g(['asset.view', 'consumable.view'], <Assets />)} />
        <Route path="assets/new" element={g(['asset.create', 'consumable.manage'], <AssetForm />)} />
        <Route path="assets/:id" element={g('asset.view', <AssetDetail />)} />
        <Route path="assets/:id/edit" element={g('asset.edit', <AssetForm />)} />
        <Route path="a/:tag" element={g('asset.view', <TagRedirect />)} />
        <Route path="receive" element={g(['asset.create', 'consumable.move'], <Receive />)} />
        <Route path="pending-receive" element={g('consumable.view', <PendingReceive />)} />
        <Route path="issue" element={g(['asset.transact', 'consumable.move'], <Issue />)} />
        <Route path="documents/:id" element={g(['asset.view', 'consumable.view'], <DocumentDetail />)} />
        <Route path="shop" element={g('order.create', <Shop />)} />
        <Route path="cart" element={g('order.create', <Cart />)} />
        <Route path="orders" element={g(['order.create', 'order.manage'], <Orders />)} />
        <Route path="orders/:id" element={g(['order.create', 'order.manage'], <OrderDetail />)} />
        <Route path="purchase-orders" element={g('order.manage', <PurchaseOrders />)} />
        <Route path="purchase-orders/new" element={g('order.manage', <PurchaseOrderNew />)} />
        <Route path="purchase-orders/:id" element={g('order.manage', <PurchaseOrderDetail />)} />
        <Route path="reports/issues" element={g('report.view', <Reports />)} />
        <Route path="loans" element={g('loan.view', <Loans />)} />
        <Route path="consumables" element={<Navigate to="/assets" replace />} />
        <Route path="consumables/:id" element={g('consumable.view', <ConsumableDetail />)} />
        <Route path="consumables/:id/edit" element={g('consumable.manage', <AssetForm />)} />
        <Route path="history" element={g('history.view', <HistoryPage />)} />
        <Route path="activity" element={g(['asset.view', 'consumable.view'], <ActivityPage />)} />
        <Route path="scan" element={g('scan.use', <Scan />)} />
        <Route path="labels" element={g('label.print', <Labels />)} />
        <Route path="stock-counts" element={g('stockcount.manage', <StockCounts />)} />
        <Route path="stock-counts/:id" element={g('stockcount.manage', <StockCountDetail />)} />
        <Route path="import" element={g('data.import', <ImportPage />)} />
        <Route path="people" element={g('people.view', <People />)} />
        <Route path="master" element={g('master.manage', <MasterData />)} />
        <Route path="admin/users" element={g('user.manage', <UsersPage />)} />
        <Route path="admin/roles" element={g('role.manage', <Roles />)} />
        <Route path="logs" element={g('log.view', <Logs />)} />
        <Route path="settings" element={g('settings.manage', <SettingsPage />)} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Empty title="ไม่พบหน้าที่ต้องการ">ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายไปแล้ว</Empty>} />
      </Route>
    </Routes>
  );
}
