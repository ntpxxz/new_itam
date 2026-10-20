import { Link, useParams } from 'react-router-dom';
import { Printer, PackagePlus, PackageMinus } from 'lucide-react';
import { useApi } from '../hooks.js';
import { PageHeader, Card, Loading, Empty, Chip } from '../components/ui.jsx';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, who } from '../format.js';

export default function DocumentDetail() {
  const { id } = useParams();
  const { data, loading } = useApi(`/api/documents/${id}`);
  if (loading && !data) return <Card><Loading rows={8} /></Card>;
  if (!data) return <Empty title="ไม่พบเอกสาร"><Link to="/receive">กลับ</Link></Empty>;
  const { doc: d, lines } = data;
  const isReceive = d.type === 'receive';
  const title = isReceive ? 'ใบรับเข้า' : d.mode === 'borrow' ? 'ใบยืมอุปกรณ์' : 'ใบเบิกอุปกรณ์';
  const total = lines.reduce((s, l) => s + (Number(l.unit_price) || 0) * l.qty, 0);

  return (
    <>
      <PageHeader title={`${title} ${d.doc_no}`} crumbs={[{ label: isReceive ? 'รับเข้า' : 'เบิกออก', to: isReceive ? '/receive' : '/issue' }, { label: d.doc_no }]}>
        <Link to={isReceive ? '/receive' : '/issue'} className="btn no-print">
          {isReceive ? <PackagePlus size={16} /> : <PackageMinus size={16} />}{isReceive ? 'รับเข้าใบใหม่' : 'เบิกใบใหม่'}
        </Link>
        <button className="btn btn-primary no-print" onClick={() => window.print()}><Printer size={16} />พิมพ์</button>
      </PageHeader>

      <Card className="doc-sheet">
        <div className="doc-head">
          <div>
            <div className="l-org">AssetFlow · IT Asset Management</div>
            <h2 className="doc-title">{title}</h2>
          </div>
          <dl className="dl doc-meta">
            <dt>เลขที่</dt><dd className="mono">{d.doc_no}</dd>
            <dt>{isReceive ? 'วันที่รับเข้า' : 'วันที่เบิก'}</dt><dd>{fmtDate(d.doc_date)}</dd>
            {!isReceive && d.mode === 'borrow' && <><dt>กำหนดคืน</dt><dd><strong>{fmtDate(d.due_date)}</strong></dd></>}
          </dl>
        </div>

        <dl className="dl" style={{ margin: '16px 0' }}>
          {isReceive ? (
            <>
              <dt>ผู้ขาย</dt><dd>{d.vendor_name || '—'}</dd>
              <dt>เลข PO / ใบแจ้งหนี้</dt><dd className="mono">{[d.po_number, d.invoice_number].filter(Boolean).join(' / ') || '—'}</dd>
              <dt>เก็บเข้าสถานที่</dt><dd>{d.location_name || '—'}</dd>
            </>
          ) : (
            <>
              <dt>ผู้รับ</dt><dd>{d.person_name || 'ทั้งแผนก (ไม่ระบุชื่อ)'}{d.emp_code && <span className="tag"> ({d.emp_code})</span>}</dd>
              <dt>แผนก</dt><dd>{d.department_name || '—'}</dd>
              <dt>ประเภท</dt><dd>{d.mode === 'borrow' ? <Chip tone="brand">ยืม (ต้องคืน)</Chip> : <Chip tone="brand" dot={false}>เบิกออก</Chip>}</dd>
            </>
          )}
          {d.note && <><dt>หมายเหตุ</dt><dd>{d.note}</dd></>}
        </dl>

        <div className="table-wrap">
          <table className="table compact" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th><th>รายการ</th><th>รหัส / Serial</th><th className="text-right">จำนวน</th>
                {isReceive && <><th className="text-right">ราคา/หน่วย</th><th className="text-right">รวม</th></>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={`${l.kind}${l.id}`}>
                  <td className="mono muted">{i + 1}</td>
                  <td>
                    <Link to={l.kind === 'asset' ? `/assets/${l.ref_id}` : `/consumables/${l.ref_id}`} className="cell-main">{l.name}</Link>
                    <div className="cell-sub">{l.category_name}</div>
                  </td>
                  <td className="mono">{l.code}{l.serial_no && <div className="cell-sub">SN {l.serial_no}</div>}</td>
                  <td className="text-right nowrap"><span className="mono">{fmtNum(l.qty)}</span> {l.unit}</td>
                  {isReceive && <><td className="text-right mono">{fmtMoney(l.unit_price)}</td><td className="text-right mono">{fmtMoney((Number(l.unit_price) || 0) * l.qty)}</td></>}
                </tr>
              ))}
            </tbody>
            {isReceive && (
              <tfoot>
                <tr><td colSpan={5} className="text-right" style={{ fontWeight: 600, padding: '12px 16px' }}>มูลค่ารวม</td><td className="text-right mono" style={{ fontWeight: 600, padding: '12px 16px' }}>{fmtMoney(total)}</td></tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="signatures">
          <div><div className="sig-line" />{isReceive ? 'ผู้ส่งของ' : 'ผู้รับอุปกรณ์'}<div className="cell-sub">{isReceive ? d.vendor_name : who(d.person_name, d.department_name)}</div></div>
          <div><div className="sig-line" />{isReceive ? 'ผู้รับเข้า' : 'ผู้จ่ายอุปกรณ์'}<div className="cell-sub">{d.created_by_name}</div></div>
          <div><div className="sig-line" />ผู้อนุมัติ<div className="cell-sub">&nbsp;</div></div>
        </div>
        <p className="field-hint" style={{ marginTop: 16 }}>บันทึกโดย {d.created_by_name} · {fmtDateTime(d.created_at)}</p>
      </Card>
    </>
  );
}
