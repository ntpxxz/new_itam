// Wipes data/itam.db and fills it with realistic demo data.
import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dbFile = process.env.DB_PATH || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'itam.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });

const { run, get, tx } = await import('./db.js');
const { bootstrap, roleId } = await import('./bootstrap.js');
const { hashPassword } = await import('./auth.js');

bootstrap();

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const iso = (d) => d.toISOString().slice(0, 10);
const ts = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

tx(() => {
  const ids = (table, rows, cols) => rows.map((r) => Number(run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...r).lastInsertRowid));

  run('UPDATE users SET full_name = ? WHERE username = ?', 'สมชาย ผู้ดูแลระบบ', 'admin');
  run('INSERT INTO users (username, password_hash, full_name, email, role_id, password_changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    'staff', hashPassword('Staff@1234'), 'วิภา เจ้าหน้าที่ไอที', 'wipa@example.com', roleId('it_staff'), ts(new Date()));
  run('INSERT INTO users (username, password_hash, full_name, email, role_id, password_changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    'viewer', hashPassword('Viewer@1234'), 'กิตติ ผู้ตรวจสอบ', 'kitti@example.com', roleId('viewer'), ts(new Date()));
  const staffId = get(`SELECT id FROM users WHERE username='staff'`).id;
  const adminId = get(`SELECT id FROM users WHERE username='admin'`).id;
  const actors = [adminId, staffId, staffId];

  const depts = ids('departments', [['ไอที'], ['บัญชีและการเงิน'], ['ฝ่ายขาย'], ['ทรัพยากรบุคคล'], ['การตลาด'], ['ปฏิบัติการ']], ['name']);
  const locs = ids('locations', [
    ['คลัง IT ชั้น 3', 'สำนักงานใหญ่'], ['ห้อง Server', 'สำนักงานใหญ่'], ['ชั้น 5 โซน A', 'สำนักงานใหญ่'],
    ['สาขาเชียงใหม่', 'เชียงใหม่'], ['สาขาภูเก็ต', 'ภูเก็ต'],
  ], ['name', 'branch']);
  const vendors = ids('vendors', [
    ['Advice IT', 'คุณนพ', '02-111-2222', 'sales@advice.example'], ['JIB Computer', 'คุณแอน', '02-333-4444', 'b2b@jib.example'],
    ['Synnex Thailand', 'คุณต้น', '02-555-6666', 'corp@synnex.example'], ['Office Mate', 'คุณปุ้ย', '02-777-8888', 'b2b@officemate.example'],
  ], ['name', 'contact', 'phone', 'email']);
  const assetCats = ids('categories', [
    ['โน้ตบุ๊ก', 'asset', 'NB'], ['คอมพิวเตอร์ตั้งโต๊ะ', 'asset', 'PC'], ['จอภาพ', 'asset', 'MON'], ['เครื่องพิมพ์', 'asset', 'PRT'],
    ['อุปกรณ์เครือข่าย', 'asset', 'NET'], ['แท็บเล็ต', 'asset', 'TAB'], ['โปรเจกเตอร์', 'asset', 'PJ'],
  ], ['name', 'kind', 'prefix']);
  const consCats = ids('categories', [
    ['เมาส์และคีย์บอร์ด', 'consumable', 'MSE'], ['สายสัญญาณ', 'consumable', 'CBL'], ['หมึกพิมพ์', 'consumable', 'INK'],
    ['อุปกรณ์จัดเก็บข้อมูล', 'consumable', 'USB'], ['อุปกรณ์เสริม', 'consumable', 'ACC'],
  ], ['name', 'kind', 'prefix']);

  const names = ['ณัฐพล ศรีสุข', 'กมลวรรณ ทองดี', 'ปิยะพงษ์ แก้วมณี', 'สุภาวดี จันทร์เพ็ญ', 'ธนากร วงศ์ใหญ่', 'อรุณี สายทอง', 'วีรยุทธ บุญมา',
    'ชลธิชา พรหมมา', 'อนุชา รัตนกุล', 'พิมพ์ชนก ใจดี', 'ภานุวัฒน์ สมบูรณ์', 'ศิริพร นาคสวัสดิ์', 'ธีรเดช อินทร์แก้ว', 'มณีรัตน์ ประเสริฐ',
    'กฤษดา ชัยมงคล', 'จิราพร สุขเจริญ'];
  const people = ids('people', names.map((n, i) => [`EMP${String(1001 + i)}`, n, depts[i % depts.length], `emp${1001 + i}@example.com`, `08${String(10000000 + i * 7654321).slice(0, 8)}`]),
    ['emp_code', 'name', 'department_id', 'email', 'phone']);

  const models = [
    [0, 'โน้ตบุ๊ก Dell Latitude 5440', 'Dell', 'Latitude 5440', 'Core i5-1345U / 16GB / 512GB SSD', 32900, 14],
    [0, 'โน้ตบุ๊ก Lenovo ThinkPad E14', 'Lenovo', 'ThinkPad E14 Gen 5', 'Ryzen 5 7530U / 16GB / 512GB SSD', 27500, 10],
    [0, 'MacBook Air 13" M3', 'Apple', 'MacBook Air M3', 'M3 / 16GB / 256GB', 42900, 3],
    [1, 'คอมพิวเตอร์ HP ProDesk 400 G9', 'HP', 'ProDesk 400 G9 SFF', 'Core i5-12500 / 8GB / 256GB', 21900, 6],
    [2, 'จอ Dell 24" P2423H', 'Dell', 'P2423H', '23.8" IPS FHD', 5490, 10],
    [2, 'จอ LG 27" 27MP60G', 'LG', '27MP60G', '27" IPS FHD 75Hz', 4990, 4],
    [3, 'เครื่องพิมพ์ HP LaserJet M211dw', 'HP', 'LaserJet Pro M211dw', 'Mono laser, Duplex, WiFi', 6290, 3],
    [3, 'เครื่องพิมพ์ Brother MFC-L2770DW', 'Brother', 'MFC-L2770DW', 'Mono laser MFP', 9990, 2],
    [4, 'Switch Cisco CBS250-24T', 'Cisco', 'CBS250-24T-4G', '24-port GbE managed', 14500, 2],
    [4, 'Access Point Ubiquiti U6 Lite', 'Ubiquiti', 'U6-Lite', 'WiFi 6', 4290, 4],
    [5, 'iPad 10th Gen', 'Apple', 'iPad 10', '64GB WiFi', 15900, 3],
    [6, 'โปรเจกเตอร์ Epson EB-X51', 'Epson', 'EB-X51', '3800 lumens XGA', 15990, 2],
  ];

  const counters = {};
  const assetIds = [];
  const atx = (assetId, action, from, to, extra, when) => run(
    `INSERT INTO asset_transactions (asset_id, action, from_status, to_status, person_id, department_id, location_id, due_date, note, cost, performed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    assetId, action, from, to, extra.person_id, extra.department_id, extra.location_id, extra.due_date, extra.note, extra.cost, pick(actors), ts(when));

  for (const [ci, name, brand, model, specs, price, qty] of models) {
    for (let k = 0; k < qty; k++) {
      const bought = daysAgo(Math.floor(rand() * 900) + 5);
      const year = bought.getFullYear();
      const prefix = ['NB', 'PC', 'MON', 'PRT', 'NET', 'TAB', 'PJ'][ci];
      const key = `${prefix}-${year}`;
      counters[key] = (counters[key] || 0) + 1;
      const tag = `${key}-${String(counters[key]).padStart(5, '0')}`;
      const warrantyYears = ci === 0 || ci === 1 ? 3 : ci === 4 ? 1 : 2;
      const warranty = new Date(bought); warranty.setFullYear(warranty.getFullYear() + warrantyYears);
      const loc = ci === 4 ? locs[1] : pick([locs[0], locs[0], locs[2], locs[3], locs[4]]);
      const id = Number(run(`INSERT INTO assets (asset_tag, category_id, name, brand, model, serial_no, specs, location_id, department_id, purchase_date,
          purchase_price, po_number, invoice_number, vendor_id, warranty_expiry, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        tag, assetCats[ci], name, brand, model, `${brand.slice(0, 2).toUpperCase()}${Math.floor(rand() * 1e8).toString().padStart(8, '0')}`,
        specs, loc, depts[0], iso(bought), price, `PO-${year}-${String(Math.floor(rand() * 900) + 100)}`, `INV-${Math.floor(rand() * 90000) + 10000}`,
        pick(vendors), iso(warranty), ts(bought), ts(bought)).lastInsertRowid);
      atx(id, 'receive', null, 'available', { location_id: loc, cost: price, note: 'รับเข้าคลัง' }, bought);
      assetIds.push({ id, ci, bought, loc });
    }
  }

  // Give assets a lifecycle
  for (const a of assetIds) {
    const roll = rand();
    const someone = pick(people);
    const dept = get('SELECT department_id FROM people WHERE id = ?', someone).department_id;
    const p = rand() < 0.15 ? null : someone; // some items go to the department as a whole, no named person
    const start = addDays(a.bought, 3);
    const set = (fields) => run(`UPDATE assets SET ${Object.keys(fields).map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...Object.values(fields), ts(new Date()), a.id);

    if (a.ci === 4) continue; // network gear stays in server room
    if (roll < 0.42) {
      set({ status: 'issued', holder_person_id: p, department_id: dept });
      atx(a.id, 'issue', 'available', 'issued', { person_id: p, department_id: dept, note: 'เบิกใช้งานประจำ' }, start);
    } else if (roll < 0.62) {
      // borrowed — some overdue
      const when = daysAgo(Math.floor(rand() * 20) + 1);
      const due = addDays(when, Math.floor(rand() * 14) + 2);
      set({ status: 'borrowed', holder_person_id: someone, department_id: dept, due_date: iso(due) });
      atx(a.id, 'borrow', 'available', 'borrowed', { person_id: someone, department_id: dept, due_date: iso(due), note: pick(['ใช้นำเสนองานลูกค้า', 'ใช้ระหว่างเครื่องหลักส่งซ่อม', 'อบรมพนักงานใหม่', 'ออกงานนอกสถานที่']) }, when);
    } else if (roll < 0.69) {
      const when = daysAgo(Math.floor(rand() * 10) + 1);
      set({ status: 'repair' });
      atx(a.id, 'repair_out', 'available', 'repair', { note: pick(['จอแสดงผลเป็นเส้น', 'เปิดไม่ติด', 'แบตเตอรี่เสื่อม', 'กระดาษติดบ่อย']), cost: null }, when);
    } else if (roll < 0.73) {
      const when = daysAgo(Math.floor(rand() * 10) + 15);
      set({ status: 'pending_disposal' });
      atx(a.id, 'repair_out', 'available', 'repair', { note: 'เมนบอร์ดเสีย' }, addDays(when, -20));
      atx(a.id, 'to_disposal', 'repair', 'pending_disposal', { note: 'ค่าซ่อมสูงกว่ามูลค่าเครื่อง' }, when);
    } else if (roll < 0.76) {
      const when = daysAgo(Math.floor(rand() * 60) + 30);
      set({ status: 'scrapped' });
      atx(a.id, 'to_disposal', 'available', 'pending_disposal', { note: 'หมดอายุการใช้งาน' }, addDays(when, -7));
      atx(a.id, 'scrap', 'pending_disposal', 'scrapped', { note: 'จำหน่ายตามมติคณะกรรมการ ครั้งที่ 3/2026' }, when);
    } else if (roll < 0.86) {
      // had a past borrow, returned
      const when = daysAgo(Math.floor(rand() * 60) + 20);
      atx(a.id, 'borrow', 'available', 'borrowed', { person_id: someone, department_id: dept, due_date: iso(addDays(when, 7)), note: 'ยืมใช้ชั่วคราว' }, when);
      atx(a.id, 'return', 'borrowed', 'available', { person_id: someone, note: 'คืนสภาพดี' }, addDays(when, 6));
    }
  }

  // Consumables
  const cons = [
    [0, 'เมาส์ USB Logitech B100', 'ชิ้น', 25, 10, 159], [0, 'เมาส์ไร้สาย Logitech M190', 'ชิ้น', 6, 8, 390],
    [0, 'คีย์บอร์ด USB Logitech K120', 'ชิ้น', 14, 6, 290], [1, 'สาย LAN CAT6 2 เมตร', 'เส้น', 40, 15, 65],
    [1, 'สาย HDMI 1.8 เมตร', 'เส้น', 3, 5, 180], [1, 'สายชาร์จ USB-C 1 เมตร', 'เส้น', 12, 5, 250],
    [2, 'ตลับหมึก HP 137A', 'ตลับ', 2, 4, 1890], [2, 'ตลับหมึก Brother TN-2460', 'ตลับ', 5, 3, 1450],
    [3, 'แฟลชไดรฟ์ USB 32GB', 'ชิ้น', 18, 10, 189], [3, 'แฟลชไดรฟ์ USB 64GB', 'ชิ้น', 0, 5, 289],
    [4, 'แผ่นรองเมาส์', 'ชิ้น', 30, 10, 59], [4, 'หูฟัง USB Headset', 'ชิ้น', 9, 5, 590],
  ];
  const skuCount = {};
  for (const [ci, name, unit, finalQty, reorder, cost] of cons) {
    const prefix = ['MSE', 'CBL', 'INK', 'USB', 'ACC'][ci];
    skuCount[prefix] = (skuCount[prefix] || 0) + 1;
    const sku = `C-${prefix}-${String(skuCount[prefix]).padStart(4, '0')}`;
    const id = Number(run(`INSERT INTO consumables (sku, category_id, name, unit, qty_on_hand, reorder_point, location_id, unit_cost, vendor_id)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`, sku, consCats[ci], name, unit, reorder, locs[0], cost, pick(vendors)).lastInsertRowid);
    // Build history backwards: several receipts and issues over 6 months, ending at finalQty.
    let bal = 0;
    const events = [];
    for (let m = 170; m > 0; m -= Math.floor(rand() * 9) + 4) {
      events.push(m);
    }
    const plannedOut = events.length * 2;
    const firstIn = finalQty + plannedOut + 5;
    run(`INSERT INTO stock_movements (consumable_id, type, qty, balance_after, unit_cost, note, performed_by, created_at) VALUES (?, 'in', ?, ?, ?, ?, ?, ?)`,
      id, firstIn, (bal = firstIn), cost, `รับเข้าตาม PO-2026-${100 + id}`, staffId, ts(daysAgo(178)));
    for (const m of events) {
      if (bal - finalQty <= 0) break;
      const q = Math.min(bal - finalQty, Math.floor(rand() * 3) + 1);
      const p = pick(people);
      bal -= q;
      const pd = get('SELECT department_id FROM people WHERE id = ?', p).department_id;
      run(`INSERT INTO stock_movements (consumable_id, type, qty, balance_after, person_id, department_id, note, performed_by, created_at)
        VALUES (?, 'out', ?, ?, ?, ?, ?, ?, ?)`,
        id, q, bal, rand() < 0.2 ? null : p, pd, pick(['ของเดิมชำรุด', 'พนักงานใหม่', 'ใช้ห้องประชุม', '']), pick(actors), ts(daysAgo(m)));
    }
    if (bal !== finalQty) {
      run(`INSERT INTO stock_movements (consumable_id, type, qty, balance_after, note, performed_by, created_at) VALUES (?, 'adjust', ?, ?, ?, ?, ?)`,
        id, finalQty - bal, finalQty, 'ปรับยอดตามผลตรวจนับ', adminId, ts(daysAgo(1)));
    }
    run('UPDATE consumables SET qty_on_hand = ? WHERE id = ?', finalQty, id);
  }

  run('UPDATE assets SET received_date = purchase_date');
  run(`UPDATE stock_movements SET received_date = date(created_at) WHERE type = 'in'`);
});

console.log('Seed complete → data/itam.db');
console.log('  admin / Admin@1234   staff / Staff@1234   viewer / Viewer@1234');
