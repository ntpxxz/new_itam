// Reads a receive CSV in the browser: Barcode/SKU + Quantity required, Name and Unit Price optional.
const COLS = {
  sku: ['barcode', 'sku', 'บาร์โค้ด', 'รหัส', 'รหัสสินค้า', 'code'],
  name: ['name', 'ชื่อ', 'รายการ', 'ชื่อสินค้า'],
  qty: ['quantity', 'qty', 'จำนวน', 'จำนวนรับ', 'จำนวนรับเข้า'],
  unit_cost: ['unit price', 'price', 'unit_cost', 'ราคา', 'ราคา/หน่วย', 'ราคาต่อหน่วย'],
};

export function parseCsv(text) {
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
export async function readCsvFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-874').decode(buf); }
}

export function receiveRows(text) {
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ''));
  if (!header) throw new Error('ไฟล์ว่าง');
  const h = header.map((x) => x.trim().toLowerCase());
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, h.findIndex((x) => names.includes(x))]));
  if (idx.sku < 0 || idx.qty < 0) throw new Error('ไม่พบคอลัมน์ บาร์โค้ด/SKU หรือ จำนวน ในแถวแรกของไฟล์ — ดูตัวอย่างจากแม่แบบ CSV');
  const cell = (r, k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  return body.map((r, n) => {
    const price = cell(r, 'unit_cost').replace(/,/g, '');
    return { line: n + 2, sku: cell(r, 'sku'), name: cell(r, 'name'), qty: Number(cell(r, 'qty').replace(/,/g, '')), unit_cost: price === '' ? null : Number(price) };
  });
}

export function downloadReceiveTemplate() {
  const csv = '﻿Barcode,Name,Quantity,Unit Price\n8850000000017,เมาส์ USB Logitech B100,10,159\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'pending-receive-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
