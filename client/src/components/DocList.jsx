import { Link, useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useApi } from '../hooks.js';
import { Card, Empty, Loading, Chip } from './ui.jsx';
import { fmtDate, fmtNum, fmtMoney, who } from '../format.js';

export default function DocList({ type, title, limit = 10 }) {
  const navigate = useNavigate();
  const { data, loading } = useApi('/api/documents', { type, pageSize: limit });
  return (
    <Card title={title} noBody>
      {loading && !data ? <Loading rows={4} /> : !data?.rows.length ? (
        <Empty icon={FileText} title="ยังไม่มีเอกสาร">{type === 'receive' ? 'ใบรับเข้าที่บันทึกจะแสดงที่นี่' : 'ใบเบิกที่บันทึกจะแสดงที่นี่'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th>เลขที่</th><th>วันที่</th>
                <th>{type === 'receive' ? 'ผู้ขาย / PO' : 'ผู้รับ'}</th>
                <th className="text-right">จำนวน</th>
                {type === 'receive' ? <th className="text-right">มูลค่า</th> : <th>ประเภท</th>}
                <th>ผู้บันทึก</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((d) => (
                <tr key={d.id} className="clickable" onClick={() => navigate(`/documents/${d.id}`)}>
                  <td><Link to={`/documents/${d.id}`} className="mono" onClick={(e) => e.stopPropagation()}>{d.doc_no}</Link></td>
                  <td className="nowrap">{fmtDate(d.doc_date)}</td>
                  <td>
                    {type === 'receive'
                      ? <>{d.vendor_name || '—'}{d.po_number && <div className="tag">{d.po_number}</div>}</>
                      : <>{who(d.person_name, d.section) || '—'}<div className="cell-sub">{d.department_name}</div></>}
                  </td>
                  <td className="text-right nowrap">
                    {d.asset_count > 0 && <div><span className="mono">{fmtNum(d.asset_count)}</span> <span className="muted">ชิ้น (รายชิ้น)</span></div>}
                    {d.unit_count > 0 && <div><span className="mono">{fmtNum(d.unit_count)}</span> <span className="muted">หน่วย (นับจำนวน)</span></div>}
                  </td>
                  {type === 'receive'
                    ? <td className="text-right mono">{fmtMoney(d.total_value)}</td>
                    : <td>{d.mode === 'borrow' ? <Chip tone="brand">ยืม · คืน {fmtDate(d.due_date)}</Chip> : <Chip tone="brand" dot={false}>เบิกออก</Chip>}</td>}
                  <td className="muted">{d.created_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
