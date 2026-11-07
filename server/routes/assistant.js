import { Router } from 'express';
import { all, get } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { bad, likeTerm, today } from './util.js';
import { parseMessage, INTENT_WORD } from '../assistant-parse.js';

// Chat assistant (rule-based, offline): turns a typed request into a DRAFT receive/issue slip.
// It never writes: the user reviews the draft and the client posts it to /api/documents/*,
// so every rule, history row and audit entry still comes from documents.js.
const r = Router();

const HELP = `พิมพ์ขึ้นต้นด้วย รับเข้า / เบิก / ยืม ตามด้วยชื่อหรือรหัสสินค้าและจำนวน เช่น
• รับเข้า เมาส์ M101 5 ชิ้น @250
• เบิก สาย LAN 2 เส้น ให้แผนกบัญชี
• ยืม NB-2026-00012 ให้สมชาย คืน 15/11
หลายรายการคั่นด้วย , หรือ “และ” · ระบุวันที่ย้อนหลังด้วย “วันที่ 28/10” หรือ “เมื่อวาน”
พิมพ์ “วิธีใช้” เพื่อดูคำสั่งทั้งหมด`;

// Full keyword list, shown for วิธีใช้ / help. Keep in sync with assistant-parse.js.
const KEYWORDS = `คำสั่ง (ขึ้นต้นข้อความ)
• รับเข้า: รับเข้า · รับของ · รับ · receive · rcv
• เบิก: เบิก · เบิกออก · เบิกจ่าย · จ่าย · issue
• ยืม: ยืม · borrow (ต้องระบุวันคืน)

สินค้า
• บาร์โค้ด/SKU, รหัสอุปกรณ์ (NB-2026-00012), Serial หรือชื่อบางส่วน เช่น “ATEN”
• หลายรายการคั่นด้วย , หรือ + หรือ “และ” หรือขึ้นบรรทัดใหม่
• ไทย/อังกฤษใช้แทนกันได้ เช่น mouse = เมาส์, cable = สาย, toner = หมึก, monitor = จอ, adapter = หัวแปลง

จำนวนและราคา
• จำนวน (ไม่เกิน 4 หลัก): 5 · 5 ชิ้น · x5 · 5x
• หน่วย: ชิ้น อัน ตัว เส้น กล่อง ม้วน แพ็ค ลัง ตลับ ชุด เครื่อง ใบ แผ่น คู่ ขวด รีม pcs box set
• ราคา (รับเข้า): @250 · ราคา 250 · ชิ้นละ 250 · 250 บาท

ผู้รับ (เบิก/ยืม)
• ให้ สมชาย · ให้ สมชาย แผนกบัญชี · ให้ แผนกบัญชี · to … · for …

วันที่
• วันที่ของใบ (ย้อนหลังได้): วันที่ 28/10 · ลงวันที่ … · เมื่อวาน · เมื่อวานซืน
• วันคืน (ยืม): คืน 15/11 · กำหนดคืน … · คืนภายใน … · due …
• รูปแบบ: 15/11 · 15/11/69 · 5 พ.ย. · 2026-11-15 · วันนี้ · พรุ่งนี้ · อีก 7 วัน

ตัวอย่าง
• รับเข้า เมาส์ M101 5 ชิ้น @250
• รับเข้า 8850000000017 3, ATEN 2 วันที่ เมื่อวาน
• เบิก สาย LAN 2 เส้น ให้แผนกบัญชี
• ยืม NB-2026-00012 ให้สมหญิง คืน อีก 7 วัน

ระบบจะสร้างร่างให้ตรวจก่อน — กด “บันทึก” จึงจะบันทึกจริง`;

const MAX_UNITS = 200;

/* ---------- lookups ---------- */
// English words people type for items whose names are stored in Thai (and vice versa).
const SYNONYMS = [
  ['mouse', 'เมาส์', 'เม้าส์'], ['keyboard', 'คีย์บอร์ด', 'คีบอร์ด'], ['cable', 'สาย'], ['lan', 'แลน'],
  ['toner', 'หมึก', 'ตลับหมึก'], ['ink', 'หมึก'], ['cartridge', 'ตลับหมึก', 'ตลับ'], ['notebook', 'โน้ตบุ๊ก', 'โน๊ตบุ๊ค', 'laptop'],
  ['laptop', 'โน้ตบุ๊ก', 'notebook'], ['monitor', 'จอ', 'จอภาพ'], ['printer', 'ปริ้นเตอร์', 'เครื่องพิมพ์'], ['charger', 'สายชาร์จ', 'ชาร์จ'],
  ['adapter', 'อะแดปเตอร์', 'หัวแปลง'], ['headset', 'หูฟัง'], ['speaker', 'ลำโพง'], ['battery', 'แบตเตอรี่', 'ถ่าน'],
  ['flash', 'แฟลชไดร์ฟ', 'แฟลชไดรฟ์'], ['mousepad', 'แผ่นรองเมาส์'], ['paper', 'กระดาษ'], ['projector', 'โปรเจคเตอร์', 'โปรเจกเตอร์'],
];
const variants = (t) => {
  const low = t.toLowerCase();
  const group = SYNONYMS.filter((g) => g.includes(low)).flat();
  return [...new Set([t, ...group])];
};
const tokens = (q) => q.replace(/"/g, '').split(/\s+/).filter(Boolean).slice(0, 6);
const codeLike = (t) => /\d/.test(t) && /[a-z]/i.test(t);

// Every word must match one of `cols` (any synonym of the word counts).
function wordSearch(ts, cols, run) {
  const parts = ts.map((t) => {
    const vs = variants(t);
    return { sql: `(${vs.flatMap(() => cols.map((c) => `${c} LIKE ? ESCAPE '\\'`)).join(' OR ')})`, params: vs.flatMap((v) => cols.map(() => likeTerm(v))) };
  });
  return run(parts.map((p) => p.sql).join(' AND '), parts.flatMap((p) => p.params));
}

// Names first; category names only when nothing matches by name; finally just the model code ("Mouse M190" → "M190").
async function staged(query, nameCols, catCol, run) {
  const ts = tokens(query);
  if (!ts.length) return [];
  let rows = await wordSearch(ts, nameCols, run);
  if (!rows.length) rows = await wordSearch(ts, [...nameCols, catCol], run);
  const codes = ts.filter(codeLike);
  if (!rows.length && codes.length && codes.length < ts.length) rows = await wordSearch(codes, nameCols, run);
  return rows;
}

async function findConsumables(query) {
  const exact = await get('SELECT id, sku, name, unit, qty_on_hand, unit_cost FROM consumables WHERE deleted_at IS NULL AND sku = ? COLLATE NOCASE', query.replace(/"/g, ''));
  if (exact) return [exact];
  return staged(query, ['x.sku', 'x.name'], 'c.name', (cond, params) => all(`SELECT x.id, x.sku, x.name, x.unit, x.qty_on_hand, x.unit_cost
    FROM consumables x JOIN categories c ON c.id = x.category_id
    WHERE x.deleted_at IS NULL AND ${cond} ORDER BY length(x.name), x.name, x.id LIMIT 8`, ...params));
}

async function findAssets(query) {
  const q = query.replace(/"/g, '');
  const exact = await all(`SELECT id, asset_tag, name, status FROM assets WHERE deleted_at IS NULL AND (asset_tag = ? COLLATE NOCASE OR serial_no = ? COLLATE NOCASE)`, q, q);
  if (exact.length) return { exact: true, rows: exact };
  if (/^".+"$/.test(query.trim())) {
    return { exact: false, rows: await all(`SELECT id, asset_tag, name, status FROM assets WHERE deleted_at IS NULL AND status <> 'scrapped' AND name = ? COLLATE NOCASE
      ORDER BY CASE WHEN status = 'available' THEN 0 ELSE 1 END, asset_tag LIMIT 50`, q) };
  }
  return { exact: false, rows: await staged(query, ['a.name', 'a.brand', 'a.model'], 'c.name', (cond, params) => all(`SELECT a.id, a.asset_tag, a.name, a.status
    FROM assets a JOIN categories c ON c.id = a.category_id
    WHERE a.deleted_at IS NULL AND a.status <> 'scrapped' AND ${cond} ORDER BY CASE WHEN a.status = 'available' THEN 0 ELSE 1 END, a.asset_tag LIMIT 50`, ...params)) };
}

const DEPT_WORD = /^(แผนก|ฝ่าย(?=\S)|dept\.?|department)\s*/i;

async function findDepartment(text) {
  const t = text.trim();
  const bare = t.replace(/^(แผนก|dept\.?|department)\s*/i, '').replace(/\s+(dept\.?|department)$/i, '').trim();
  for (const n of [t, bare]) {
    const d = await get('SELECT name FROM departments WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE', n);
    if (d) return { name: d.name, known: true };
  }
  const like = await all(`SELECT name FROM departments WHERE deleted_at IS NULL AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 2`, likeTerm(bare));
  if (like.length === 1) return { name: like[0].name, known: true };
  return { name: bare, known: false };
}

// "สมชาย แผนกบัญชี" → name + department; "แผนกบัญชี" / "IT dept" / a known department → department only.
async function splitRecipient(text) {
  const t = text.trim();
  const m = t.match(/^(.*?)\s*((?:แผนก|dept\.?\s|department\s)\s*.+)$/i) || t.match(/^(.*?)\s+(\S+\s+(?:dept\.?|department))$/i);
  if (m) return { person_name: m[1].trim() || null, dept: await findDepartment(m[2]) };
  if (DEPT_WORD.test(t) || /\s(dept\.?|department)$/i.test(t)) return { person_name: null, dept: await findDepartment(t) };
  const asDept = await get('SELECT name FROM departments WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE', t);
  if (asDept) return { person_name: null, dept: { name: asDept.name, known: true } };
  return { person_name: t, dept: null };
}

/* ---------- build the draft ---------- */
const STATUS_TH = { available: 'พร้อมใช้', borrowed: 'ถูกยืม', issued: 'เบิกถาวร', repair: 'กำลังซ่อม', pending_disposal: 'รอจำหน่าย' };

async function buildDraft(user, text) {
  const p = parseMessage(text, today());
  if (!p.intent) return { reply: `ไม่เข้าใจคำสั่ง\n${HELP}` };
  const { intent } = p;
  if (intent === 'receive' && !can(user, 'consumable.move') && !can(user, 'asset.create')) return { reply: 'คุณไม่มีสิทธิ์รับเข้า' };
  if (intent !== 'receive' && !can(user, 'consumable.move') && !can(user, 'asset.transact')) return { reply: 'คุณไม่มีสิทธิ์เบิก/ยืม' };
  if (!p.segments.length) return { reply: `ระบุสินค้าที่ต้องการ${INTENT_WORD[intent]}ด้วย เช่น “${INTENT_WORD[intent]} เมาส์ M101 1 ชิ้น”` };

  const problems = [];
  if (p.date_raw && !p.doc_date) problems.push(`อ่านวันที่ “${p.date_raw}” ไม่ได้ — ใช้รูปแบบ 28/10 หรือ 2026-10-28`);
  if (p.doc_date && p.doc_date > today()) problems.push('วันที่ต้องไม่เป็นวันในอนาคต');
  const doc_date = p.doc_date || today();

  const draft = { type: intent === 'receive' ? 'receive' : 'issue', doc_date, note: null, lines: [] };
  let newDept = null;
  if (intent !== 'receive') {
    draft.mode = intent === 'borrow' ? 'borrow' : 'issue';
    if (!p.recipient) problems.push(`ระบุผู้รับด้วย “ให้ <ชื่อ>” หรือ “ให้แผนก<ชื่อแผนก>”`);
    else {
      const rc = await splitRecipient(p.recipient);
      draft.person_name = rc.person_name;
      draft.department_name = rc.dept?.name || null;
      if (rc.dept && !rc.dept.known) newDept = rc.dept.name;
    }
    if (intent === 'borrow') {
      if (!p.due_date) problems.push(p.due_raw ? `อ่านวันคืน “${p.due_raw}” ไม่ได้ — ใช้รูปแบบ 15/11` : 'ระบุวันคืนด้วย เช่น “คืน 15/11” หรือ “คืน อีก 7 วัน”');
      else if (p.due_date < doc_date) problems.push('วันคืนต้องไม่ก่อนวันที่ยืม');
      draft.due_date = p.due_date;
    }
  }

  const choices = [];
  const usedAssets = new Set();
  for (const [i, s] of p.segments.entries()) {
    const label = p.segments.length > 1 ? `รายการที่ ${i + 1} (“${s.query}”)` : `“${s.query}”`;
    const qty = s.qty ?? 1;
    if (!(qty > 0) || qty > MAX_UNITS) { problems.push(`${label}: จำนวนต้องอยู่ระหว่าง 1–${MAX_UNITS}`); continue; }

    const cons = intent === 'borrow' ? [] : await findConsumables(s.query);
    const assets = intent === 'receive' ? { rows: [] } : await findAssets(s.query);
    const avail = assets.rows.filter((a) => a.status === 'available' && !usedAssets.has(a.id));
    const assetNames = [...new Set(avail.map((a) => a.name))];

    if (cons.length === 1 && !assets.exact) {
      const x = cons[0];
      if (intent === 'issue' && qty > x.qty_on_hand) { problems.push(`${label}: ${x.name} คงเหลือ ${x.qty_on_hand} ${x.unit} ไม่พอเบิก ${qty}`); continue; }
      draft.lines.push({ kind: 'consumable', consumable_id: x.id, code: x.sku, name: x.name, unit: x.unit, qty_on_hand: x.qty_on_hand, qty,
        ...(intent === 'receive' && { unit_cost: s.price ?? x.unit_cost ?? null }) });
      continue;
    }
    if (intent !== 'receive' && (assets.exact || (!cons.length && assetNames.length === 1))) {
      if (assets.exact && assets.rows.length === 1 && assets.rows[0].status !== 'available') {
        const a = assets.rows[0];
        problems.push(`${label}: ${a.asset_tag} สถานะ “${STATUS_TH[a.status] || a.status}” — เบิก/ยืมได้เฉพาะชิ้นที่พร้อมใช้`); continue;
      }
      if (avail.length < qty) { problems.push(`${label}: ${assetNames[0] || s.query} พร้อมใช้ ${avail.length} ชิ้น ไม่พอ${INTENT_WORD[intent]} ${qty}`); continue; }
      avail.slice(0, qty).forEach((a) => {
        usedAssets.add(a.id);
        draft.lines.push({ kind: 'asset', asset_id: a.id, code: a.asset_tag, name: a.name, qty: 1 });
      });
      continue;
    }
    if (intent === 'borrow' && !assets.rows.length && (await findConsumables(s.query)).length) { problems.push(`${label}: เป็นของสิ้นเปลือง ยืมไม่ได้ — ใช้ “เบิก” แทน`); continue; }

    const options = [
      ...cons.map((x) => ({ label: `${x.name} · ${x.sku} · คงเหลือ ${x.qty_on_hand} ${x.unit}`, code: x.sku })),
      ...assetNames.slice(0, 8 - Math.min(cons.length, 8)).map((n) => ({ label: `${n} · พร้อมใช้ ${avail.filter((a) => a.name === n).length} ชิ้น`, code: `"${n}"` })),
    ];
    if (options.length) {
      problems.push(`${label}: พบหลายรายการ — เลือกด้านล่าง หรือพิมพ์รหัสให้ชัดขึ้น`);
      if (!choices.length) {
        options.forEach((o) => choices.push({ label: o.label, command: rebuild(p, i, o.code) }));
      }
    } else if (intent === 'receive' && (await findAssets(s.query)).rows.length) {
      problems.push(`${label}: เป็นอุปกรณ์รายชิ้น — รับเข้าชิ้นใหม่ที่หน้า “รับเข้า” เพื่อกรอกหมวดหมู่ ราคา และ Serial`);
    } else if (assets.rows.length) {
      problems.push(`${label}: ไม่มีชิ้นที่พร้อมใช้ (${assets.rows.slice(0, 3).map((a) => `${a.asset_tag} ${STATUS_TH[a.status] || a.status}`).join(', ')})`);
    } else {
      problems.push(`${label}: ไม่พบในระบบ — ตรวจสอบชื่อ/รหัส หรือสร้างรายการใหม่ที่หน้า “อุปกรณ์ → เพิ่ม”`);
    }
  }

  if (problems.length) return { reply: problems.join('\n'), choices };
  const n = draft.lines.length;
  const label = draft.type === 'receive' ? 'ใบรับเข้า' : draft.mode === 'borrow' ? 'ใบยืม' : 'ใบเบิก';
  const extra = newDept ? `\nแผนก “${newDept}” ยังไม่มีในระบบ — จะสร้างใหม่เมื่อบันทึก` : '';
  return { reply: `ร่าง${label} ${n} รายการ — ตรวจสอบแล้วกด “บันทึก”${extra}`, draft };
}

// Same request with one item replaced by the chosen code, so a choice button can resend it.
function rebuild(p, index, code) {
  const items = p.segments.map((s, i) => `${i === index ? code : s.query}${s.qty ? ` ${s.qty}${s.unit ? ` ${s.unit}` : ''}` : ''}${s.price != null ? ` @${s.price}` : ''}`);
  return [
    INTENT_WORD[p.intent], items.join(', '),
    p.recipient && `ให้ ${p.recipient}`,
    p.due_raw && `คืน ${p.due_raw}`,
    p.date_raw && `วันที่ ${p.date_raw}`,
  ].filter(Boolean).join(' ');
}

/* ---------- route ---------- */
r.post('/chat', requirePerm('asset.create', 'consumable.move', 'asset.transact'), async (req, res) => {
  const text = String(req.body?.message || '').trim().slice(0, 1000);
  if (!text) throw bad('กรุณาพิมพ์ข้อความ');
  if (/^(help|ช่วย|ช่วยเหลือ|วิธีใช้|คำสั่ง|keywords?|คีย์เวิร์ด|\?)$/i.test(text)) return res.json({ reply: KEYWORDS });
  res.json(await buildDraft(req.user, text));
});

export default r;
