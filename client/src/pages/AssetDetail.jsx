import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Pencil, Printer, Laptop, User, MapPin, CalendarClock, Paperclip, ScrollText, Trash2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useApi } from '../hooks.js';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, StatusChip, Loading, Empty, Confirm, Menu } from '../components/ui.jsx';
import ActionDialog from '../components/ActionDialog.jsx';
import { ACTION_META } from '../components/actions.jsx';
import { fmtDate, fmtDateTime, fmtMoney, daysFromToday, initials, fmtISODate, who } from '../format.js';

const PRIMARY = { available: 'borrow', borrowed: 'return', issued: 'return', repair: 'repair_in', pending_disposal: 'scrap' };
const TONE_NODE = { success: 'success', brand: 'brand', warning: 'warning', danger: 'danger', neutral: '' };

export default function AssetDetail() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(`/api/assets/${id}`);
  const [action, setAction] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // Allow deep links like /assets/12?action=return (from QR scan page)
  useEffect(() => {
    const key = sp.get('action');
    if (key && data) {
      const a = data.allowedActions.find((x) => x.key === key);
      if (a) setAction(a);
      sp.delete('action');
      setSp(sp, { replace: true });
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Card><Loading rows={10} /></Card>;
  if (error || !data) return <Empty title="ไม่พบอุปกรณ์">อุปกรณ์นี้อาจถูกลบไปแล้ว · <Link to="/assets">กลับไปหน้ารายการ</Link></Empty>;

  const { asset: a, history, allowedActions } = data;
  const primary = allowedActions.find((x) => x.key === PRIMARY[a.status]);
  const others = allowedActions.filter((x) => x !== primary);
  const due = daysFromToday(a.due_date);
  const wd = daysFromToday(a.warranty_expiry);
  const origin = window.location.origin;

  const remove = async () => {
    try {
      await api.del(`/api/assets/${a.id}`);
      toast.success(`ลบ ${a.asset_tag} แล้ว`);
      navigate('/assets');
    } catch (e) { toast.error(e); throw e; }
  };

  return (
    <>
      <PageHeader title={a.name} crumbs={[{ label: 'อุปกรณ์', to: '/assets' }, { label: a.asset_tag }]}>
        <Menu label="การทำงานเพิ่มเติม" buttonClass="icon-btn" items={[
          { label: 'พิมพ์สติ๊กเกอร์', to: `/labels?ids=${a.id}`, icon: <Printer size={15} /> },
          can('log.view') && { label: 'ดู Audit Trail', to: `/logs?tab=audit&entity=asset&entity_id=${a.id}`, icon: <ScrollText size={15} /> },
          can('asset.delete') && !['borrowed', 'issued', 'repair'].includes(a.status) && '-',
          can('asset.delete') && !['borrowed', 'issued', 'repair'].includes(a.status) && { label: 'ลบอุปกรณ์', onClick: () => setConfirmDel(true), icon: <Trash2 size={15} />, danger: true },
        ]} />
        {can('asset.edit') && a.status !== 'scrapped' && <Link to={`/assets/${a.id}/edit`} className="btn"><Pencil size={16} />แก้ไข</Link>}
        {primary && (
          <button className={primary.key === 'scrap' ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => setAction(primary)}>
            {(() => { const I = ACTION_META[primary.key].icon; return <I size={16} />; })()}{primary.label}
          </button>
        )}
      </PageHeader>

      <div className="detail-grid">
        <div className="stack">
          <Card>
            <div className="asset-hero">
              <div className="asset-photo">{a.image_path ? <img src={a.image_path} alt={a.name} /> : <Laptop size={32} aria-hidden />}</div>
              <div className="stack" style={{ gap: 8, minWidth: 0 }}>
                <div className="row-wrap">
                  <StatusChip status={a.status} />
                  <span className="chip chip-neutral no-dot">{a.category_name}</span>
                </div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{a.asset_tag}</div>
                <div className="muted" style={{ fontSize: 13 }}>{[a.brand, a.model].filter(Boolean).join(' · ') || '—'}</div>
                {a.serial_no && <div className="tag">SN {a.serial_no}</div>}
              </div>
            </div>
          </Card>

          <div className="grid-2">
            <Card title="รายละเอียด">
              <dl className="dl">
                <dt>สเปก</dt><dd style={{ whiteSpace: 'pre-line' }}>{a.specs || '—'}</dd>
                <dt>สถานที่</dt><dd>{a.location_name ? `${a.location_name}${a.location_branch ? ` · ${a.location_branch}` : ''}` : '—'}</dd>
                <dt>แผนก</dt><dd>{a.department_name || '—'}</dd>
                <dt>หมายเหตุ</dt><dd style={{ whiteSpace: 'pre-line' }}>{a.notes || '—'}</dd>
                <dt>แก้ไขล่าสุด</dt><dd>{fmtDateTime(a.updated_at)}</dd>
              </dl>
            </Card>
            <Card title="การเงินและสัญญา">
              <dl className="dl">
                <dt>ราคาซื้อ</dt><dd className="mono">{fmtMoney(a.purchase_price)}</dd>
                <dt>วันที่ซื้อ</dt><dd>{fmtDate(a.purchase_date)}</dd>
                <dt>วันที่รับเข้า</dt><dd>{fmtDate(a.received_date)}</dd>
                <dt>เลข PO</dt><dd className="mono">{a.po_number || '—'}</dd>
                <dt>ใบแจ้งหนี้</dt><dd className="mono">{a.invoice_number || '—'}</dd>
                <dt>ผู้ขาย</dt><dd>{a.vendor_name || '—'}</dd>
                <dt>หมดประกัน</dt>
                <dd>
                  {a.warranty_expiry ? (
                    <span className="row" style={{ gap: 6 }}>
                      {fmtDate(a.warranty_expiry)}
                      {wd < 0 ? <span className="chip chip-neutral">หมดแล้ว</span>
                        : wd <= 30 ? <span className="chip chip-warning"><ShieldAlert size={11} />อีก {wd} วัน</span>
                          : <span className="chip chip-success"><ShieldCheck size={11} />ในประกัน</span>}
                    </span>
                  ) : '—'}
                </dd>
              </dl>
            </Card>
          </div>

          <Card title="ประวัติอุปกรณ์" noBody actions={<span className="muted" style={{ fontSize: 12.5 }}>{history.length} รายการ · แก้ไขหรือลบไม่ได้</span>}>
            {!history.length ? <Empty title="ยังไม่มีประวัติ" /> : (
              <ol className="timeline">
                {history.map((h) => {
                  const m = ACTION_META[h.action] || { label: h.action, tone: 'neutral' };
                  return (
                    <li key={h.id}>
                      <span className={`node ${TONE_NODE[m.tone]}`} aria-hidden />
                      <div className="t-head">
                        <span className="t-title">{m.label}</span>
                        {(h.person_name || h.section) && <span className="muted" style={{ fontSize: 13 }}>{['return', 'repair_in'].includes(h.action) ? 'จาก' : '→'} {who(h.person_name, h.section)}</span>}
                        <span className="t-meta">{h.doc_date && h.doc_date !== fmtISODate(h.created_at) ? <>วันที่ {fmtDate(h.doc_date)} · บันทึก {fmtDateTime(h.created_at)}</> : fmtDateTime(h.created_at)}</span>
                      </div>
                      <div className="t-body">
                        {[h.department_name && `แผนก ${h.department_name}`, h.location_name && `สถานที่ ${h.location_name}`,
                          h.due_date && `กำหนดคืน ${fmtDate(h.due_date)}`, h.cost != null && `ค่าใช้จ่าย ${fmtMoney(h.cost)}`].filter(Boolean).join(' · ')}
                        {h.note && <div>“{h.note}”</div>}
                        {h.evidence_path && (
                          <a href={h.evidence_path} target="_blank" rel="noreferrer" className="row" style={{ gap: 4, marginTop: 2 }}>
                            <Paperclip size={12} />ดูหลักฐาน
                          </a>
                        )}
                        <div className="t-meta">โดย {h.performed_by_name || 'ระบบ'}{h.doc_no && <> · <Link to={`/documents/${h.doc_id}`} className="mono">{h.doc_no}</Link></>}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="สถานะปัจจุบัน">
            <div className="stack" style={{ gap: 12 }}>
              {a.holder_name || a.holder_section ? (
                <div className="holder">
                  <span className="avatar" aria-hidden>{initials(a.holder_name || a.holder_section)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="cell-main">{a.holder_name || a.holder_section}</div>
                    {a.holder_name && a.holder_section && <div className="cell-sub">Section {a.holder_section}</div>}
                    <div className="cell-sub">{[a.holder_code, a.department_name].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              ) : (
                <div className="holder"><MapPin size={18} className="muted" aria-hidden /><div>{a.status === 'scrapped' ? 'จำหน่ายออกจากทะเบียนแล้ว' : `อยู่ในคลัง · ${a.location_name || 'ไม่ระบุสถานที่'}`}</div></div>
              )}
              {a.status === 'borrowed' && a.due_date && (
                <div className={`alert ${due < 0 ? 'danger' : 'info'}`} style={{ padding: '8px 12px' }}>
                  <CalendarClock size={16} />
                  <span>กำหนดคืน {fmtDate(a.due_date)} · {due < 0 ? <strong>เกินมา {Math.abs(due)} วัน</strong> : due === 0 ? 'วันนี้' : `อีก ${due} วัน`}</span>
                </div>
              )}
              {others.length > 0 && (
                <div className="action-grid">
                  {others.map((x) => {
                    const I = ACTION_META[x.key].icon;
                    return (
                      <button key={x.key} className={`btn${x.key === 'scrap' ? ' btn-danger' : ''}`} onClick={() => setAction(x)}>
                        <I size={16} />{x.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {a.status === 'scrapped' && <p className="muted" style={{ fontSize: 13 }}>อุปกรณ์ที่ Scrap แล้วทำรายการเพิ่มไม่ได้ ข้อมูลเก็บไว้เพื่อการตรวจสอบ</p>}
              {!allowedActions.length && a.status !== 'scrapped' && <p className="muted" style={{ fontSize: 13 }}><User size={13} /> บัญชีของคุณดูข้อมูลได้อย่างเดียว</p>}
            </div>
          </Card>

          <Card title="QR Code" foot={<Link to={`/labels?ids=${a.id}`} className="btn btn-sm btn-block"><Printer size={14} />พิมพ์สติ๊กเกอร์</Link>}>
            <div className="qr-box">
              <img src={`/api/assets/${a.id}/qr?origin=${encodeURIComponent(origin)}`} alt={`QR Code ของ ${a.asset_tag}`} />
              <span className="mono" style={{ fontWeight: 600 }}>{a.asset_tag}</span>
              <span className="field-hint" style={{ textAlign: 'center' }}>สแกนด้วยกล้องมือถือเพื่อเปิดหน้านี้และทำรายการยืม-คืน</span>
            </div>
          </Card>
        </div>
      </div>

      {action && <ActionDialog asset={a} action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); reload(); }} />}
      {confirmDel && (
        <Confirm title={`ลบ ${a.asset_tag}?`} danger confirmLabel="ลบอุปกรณ์" onConfirm={remove} onClose={() => setConfirmDel(false)}
          message="อุปกรณ์จะถูกซ่อนจากทะเบียน แต่ประวัติและ Audit Trail ยังถูกเก็บไว้ หากต้องการจำหน่ายจริงให้ใช้ “ส่งรอจำหน่าย” แทน" />
      )}
    </>
  );
}
