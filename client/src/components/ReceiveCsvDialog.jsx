import { useState } from 'react';
import { FileUp, RefreshCw, AlertTriangle, ExternalLink, Download } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { Modal, Chip } from './ui.jsx';
import { fmtMoney, fmtNum } from '../format.js';

// รับเข้าจากไฟล์ CSV: read file → match SKUs on the server → review/tick → add to the slip.
// Rows whose SKU is not in the system yet must be created first ("สร้างรายการใหม่"), then re-checked.

const COLS = {
  sku: ['barcode', 'sku', 'บาร์โค้ด', 'รหัส', 'รหัสสินค้า', 'code'],
  name: ['name', 'ชื่อ', 'รายการ', 'ชื่อสินค้า'],
  qty: ['quantity', 'qty', 'จำนวน', 'จำนวนรับ', 'จำนวนรับเข้า'],
  unit_cost: ['unit price', 'price', 'unit_cost', 'ราคา', 'ราคา/หน่วย', 'ราคาต่อหน่วย'],
};

function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// Excel saves Thai CSV as UTF-8 (with BOM), UTF-16 or Windows-874 depending on the option chosen.
async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-874').decode(buf); }
}

function toRows(text) {
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ''));
  if (!header) throw new Error('ไฟล์ว่าง');
  const h = header.map((x) => x.trim().toLowerCase());
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, h.findIndex((x) => names.includes(x))]));
  if (idx.sku < 0 || idx.qty < 0) throw new Error('ไม่พบคอลัมน์ บาร์โค้ด/SKU หรือ จำนวน ในแถวแรกของไฟล์ — ดูตัวอย่างจากแม่แบบ CSV');
  const cell = (r, k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  return body.map((r, n) => {
    const price = cell(r, 'unit_cost').replace(/,/g, '');
    return { line: n + 2, sku: cell(r, 'sku'), name: cell(r, 'name').replace(/\s+/g, ' '), qty: Number(cell(r, 'qty').replace(/,/g, '')), unit_cost: price === '' ? null : Number(price) };
  });
}

function downloadTemplate() {
  const csv = '﻿Barcode,Name,Quantity,Unit Price\n8850000000017,เมาส์ USB Logitech B100,10,159\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'receive-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

const newItemUrl = (r) => `/assets/new?${new URLSearchParams({ sku: r.sku, name: r.name, ...(r.unit_cost != null && { unit_cost: r.unit_cost }) })}`;

export default function ReceiveCsvDialog({ onAdd, onClose }) {
  const toast = useToast();
  const [file, setFile] = useState('');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async (input) => {
    setBusy(true);
    try {
      const { rows: checked } = await api.post('/api/documents/receive/check', { rows: input });
      setRows((prev) => checked.map((r) => {
        const was = prev?.find((p) => p.line === r.line);
        return { ...r, picked: r.status === 'ok' && (was ? was.picked || was.status !== 'ok' : true) };
      }));
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const parsed = toRows(await readText(f));
      setFile(f.name);
      setRows(null);
      await check(parsed);
    } catch (err) { toast.error(err.message || err); }
  };

  const recheck = () => check(rows.map(({ line, sku, name, qty, unit_cost }) => ({ line, sku, name, qty, unit_cost })));
  const set = (line, patch) => setRows((rs) => rs.map((r) => (r.line === line ? { ...r, ...patch } : r)));

  const ok = rows?.filter((r) => r.status === 'ok') || [];
  const fresh = rows?.filter((r) => r.status === 'new') || [];
  const bad = rows?.filter((r) => r.status === 'error') || [];
  const picked = ok.filter((r) => r.picked && Number.isInteger(Number(r.qty)) && Number(r.qty) > 0);
  const allPicked = ok.length > 0 && ok.every((r) => r.picked);

  const add = () => {
    onAdd(picked.map((r) => ({ item: r.item, qty: Number(r.qty), unit_cost: r.unit_cost ?? r.item.unit_cost ?? '' })));
    onClose();
  };

  return (
    <Modal title="รับเข้าจากไฟล์ CSV" onClose={onClose} wide initialFocus={false}
      footer={<>
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={add} disabled={busy || !picked.length}>
          เพิ่ม {picked.length || ''} รายการลงใบรับเข้า
        </button>
      </>}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row-wrap">
          <label className="btn">
            <FileUp size={16} />{file ? 'เลือกไฟล์อื่น' : 'เลือกไฟล์ CSV'}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={pickFile} disabled={busy} />
          </label>
          {file && <span className="mono subtle" style={{ fontSize: 13 }}>{file}</span>}
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={downloadTemplate}><Download size={14} />แม่แบบ CSV</button>
        </div>
        {!rows && <p className="field-hint">คอลัมน์ที่ต้องมี: <strong>Barcode</strong> (หรือ SKU / บาร์โค้ด) และ <strong>Quantity</strong> (จำนวนที่รับเข้า) · ไม่บังคับ: Name, Unit Price — ระบบจะยังไม่บันทึกจนกว่าคุณจะกด “บันทึกรับเข้า”</p>}
        {busy && <p className="field-hint">กำลังตรวจสอบรายการ…</p>}

        {fresh.length > 0 && (
          <div className="alert">
            <AlertTriangle size={18} />
            <span className="alert-detail">
              <strong>มี {fresh.length} รายการที่ยังไม่มีในระบบ</strong> — สร้างรายการใหม่ก่อน (ตั้งจำนวนเริ่มต้นเป็น 0 เพราะจำนวนจะเข้าจากใบรับเข้านี้) แล้วกด “ตรวจอีกครั้ง”
            </span>
            <button className="btn btn-sm" onClick={recheck} disabled={busy}><RefreshCw size={14} />ตรวจอีกครั้ง</button>
          </div>
        )}
        {bad.length > 0 && (
          <div className="alert danger">
            <AlertTriangle size={18} />
            <span className="alert-detail"><strong>{bad.length} รายการรับเข้าไม่ได้</strong> — ดูเหตุผลในตาราง แก้ในไฟล์แล้วเลือกไฟล์ใหม่</span>
          </div>
        )}

        {rows && (
          <div className="table-wrap" style={{ maxHeight: '50vh', overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" className="check" checked={allPicked} disabled={!ok.length}
                      onChange={() => setRows((rs) => rs.map((r) => (r.status === 'ok' ? { ...r, picked: !allPicked } : r)))} aria-label="เลือกทุกรายการที่พร้อมรับเข้า" />
                  </th>
                  <th>แถว</th><th>SKU / รายการ</th><th className="text-right">คงเหลือ</th><th className="text-right">รับเข้า</th><th className="text-right">ราคา/หน่วย</th><th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td>
                      <input type="checkbox" className="check" checked={!!r.picked} disabled={r.status !== 'ok'}
                        onChange={(e) => set(r.line, { picked: e.target.checked })} aria-label={`เลือกแถว ${r.line}`} />
                    </td>
                    <td className="mono subtle">{r.line}</td>
                    <td style={{ minWidth: 200 }}>
                      <div className="cell-main">{r.item?.name || r.name || '—'}</div>
                      <div className="tag">{r.sku || '—'}{r.nameDiffers && ` · ในไฟล์: ${r.name}`}</div>
                    </td>
                    <td className="text-right mono">{r.item ? `${fmtNum(r.item.qty_on_hand)} ${r.item.unit}` : '—'}</td>
                    <td className="text-right">
                      {r.status === 'ok'
                        ? <input type="number" min="1" inputMode="numeric" className="input mono" style={{ width: 80, textAlign: 'right' }} value={r.qty}
                            onChange={(e) => set(r.line, { qty: e.target.value })} aria-label={`จำนวนรับเข้า แถว ${r.line}`} />
                        : <span className="mono">{Number.isFinite(r.qty) ? fmtNum(r.qty) : '—'}</span>}
                    </td>
                    <td className="text-right mono">{r.unit_cost != null ? fmtMoney(r.unit_cost) : r.item?.unit_cost != null ? fmtMoney(r.item.unit_cost) : '—'}</td>
                    <td>
                      {r.status === 'ok' && <Chip tone="success">พร้อมรับเข้า</Chip>}
                      {r.status === 'new' && (
                        <div className="stack" style={{ gap: 4, alignItems: 'flex-start' }}>
                          <Chip tone="warning">ยังไม่มีในระบบ</Chip>
                          <a href={newItemUrl(r)} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>สร้างรายการใหม่ <ExternalLink size={12} /></a>
                        </div>
                      )}
                      {r.status === 'error' && <div className="stack" style={{ gap: 4, alignItems: 'flex-start' }}><Chip tone="danger">รับเข้าไม่ได้</Chip><span className="cell-sub">{r.problem}</span></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && (
          <p className="field-hint">
            พร้อมรับเข้า {ok.length} · ยังไม่มีในระบบ {fresh.length} · รับเข้าไม่ได้ {bad.length} — ติ๊กเลือกแล้วกด “เพิ่มลงใบรับเข้า” จากนั้นตรวจใบแล้วกด “บันทึกรับเข้า” เพื่ออัปเดตสต็อก
          </p>
        )}
      </div>
    </Modal>
  );
}
