// Rule-based parser for the chat assistant (no AI, works offline).
// Turns "รับเข้าเมาส์ M101 2 ชิ้น @250" / "เบิกสาย LAN 2 เส้น ให้แผนกบัญชี" / "ยืม NB-2026-00012 ให้สมชาย คืน 15/11"
// into { intent, doc_date, due_date, recipient, segments: [{ query, qty, price }] }. Database lookups happen in routes/assistant.js.

const INTENTS = [
  [/^(รับเข้า|รับของ|รับ|receive|rcv)/i, 'receive'],
  [/^(เบิกออก|เบิกจ่าย|เบิก|จ่าย|issue)/i, 'issue'],
  [/^(ยืม|borrow)/i, 'borrow'],
];
export const INTENT_WORD = { receive: 'รับเข้า', issue: 'เบิก', borrow: 'ยืม' };

const UNITS = 'ชิ้น|อัน|ตัว|เส้น|กล่อง|ม้วน|แพ็ค|แพ็ก|แพค|ลัง|ด้าม|ก้อน|ตลับ|ชุด|เครื่อง|ใบ|แผ่น|คู่|หลอด|ขวด|รีม|หน่วย|pcs|pc|ea|each|units|unit|boxes|box|rolls|roll|packs|pack|sets|set';
const UNIT_TAIL = `\\s*(?:${UNITS})(?![a-z])`;
const FILLER = /^(จำนวน|qty|quantity|ละ|ชิ้นละ|อันละ|of|x|×)$/i;

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONTH_RE = TH_MONTHS.map((m) => esc(m).replace(/\\\./g, '\\.?')).join('|');
const DATE_RE = `\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?|\\d{1,2}\\s*(?:${MONTH_RE})\\s*(?:\\d{2,4})?|พรุ่งนี้|tomorrow|เมื่อวานซืน|เมื่อวาน|วานนี้|yesterday|วันนี้|today|(?:อีก\\s*)?\\d{1,3}\\s*วัน|in\\s+\\d{1,3}\\s+days?`;

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (base, n) => { const d = new Date(`${base}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };

function fullYear(y) {
  let n = parseInt(y, 10);
  if (y.length <= 2) n = n >= 50 ? 2500 + n - 543 : 2000 + n; // "69" = พ.ศ. 2569
  return n > 2400 ? n - 543 : n;
}

// `future`: when no year is typed, pick the next occurrence (due dates) instead of the last one (slip dates).
export function parseDate(text, today, { future = false } = {}) {
  const t = String(text).trim().toLowerCase();
  if (/^(วันนี้|today)$/.test(t)) return today;
  if (/^(เมื่อวาน|วานนี้|yesterday)$/.test(t)) return addDays(today, -1);
  if (t === 'เมื่อวานซืน') return addDays(today, -2);
  if (/^(พรุ่งนี้|tomorrow)$/.test(t)) return addDays(today, 1);
  let m = t.match(/^(?:อีก\s*)?(\d{1,3})\s*วัน$/) || t.match(/^in\s+(\d{1,3})\s+days?$/);
  if (m) return addDays(today, Number(m[1]));
  let y; let mo; let d;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, mo, d] = [fullYear(m[1]), +m[2], +m[3]];
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) [d, mo, y] = [+m[1], +m[2], m[3] && fullYear(m[3])];
  else if ((m = t.match(new RegExp(`^(\\d{1,2})\\s*(${MONTH_RE})\\s*(\\d{2,4})?$`)))) {
    const key = m[2].replace(/\./g, '');
    [d, mo, y] = [+m[1], TH_MONTHS.findIndex((x) => x.replace(/\./g, '') === key) + 1, m[3] && fullYear(m[3])];
  } else return null;
  const year = y || +today.slice(0, 4);
  const out = `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const check = new Date(`${out}T00:00:00`);
  if (Number.isNaN(check.getTime()) || iso(check) !== out) return null;
  if (!y && future && out < today) return `${year + 1}${out.slice(4)}`;
  if (!y && !future && out > today) return `${year - 1}${out.slice(4)}`;
  return out;
}

function take(text, re) {
  const m = text.match(re);
  return m ? { m, rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() } : { m: null, rest: text };
}

function parseSegment(raw) {
  let text = ` ${raw} `;
  let price = null;
  let qty = null;
  let unit = null;
  let r = take(text, /(?:@|ราคา|price|(?:ชิ้น|อัน|ตัว|เส้น|กล่อง)?ละ)\s*(\d+(?:\.\d+)?)\s*(?:บาท|฿|baht)?/i);
  if (!r.m) r = take(text, /(?<![\w.])(\d+(?:\.\d+)?)\s*(?:บาท|฿|baht)/i);
  if (r.m) { price = Number(r.m[1]); text = ` ${r.rest} `; }

  r = take(text, new RegExp(`(?<![\\w.\\-/])(\\d{1,4})(${UNIT_TAIL})`, 'i'));
  if (!r.m) r = take(text, /(?:^|\s)[x×]\s*(\d{1,4})(?![\w])/i);
  if (!r.m) r = take(text, /(?<![\w.\-/])(\d{1,4})\s*[x×](?=\s|$)/i);
  if (!r.m) {
    const all = [...text.matchAll(/(?<![\w.\-/])(\d{1,4})(?![\w.\-/])/g)];
    if (all.length) {
      const last = all.at(-1);
      r = { m: last, rest: (text.slice(0, last.index) + ' ' + text.slice(last.index + last[0].length)).trim() };
    }
  }
  if (r.m) { qty = Number(r.m[1]); unit = r.m[2]?.trim() || null; text = r.rest; }

  const query = text.replace(new RegExp(`(^|\\s)(?:${UNITS})(?=\\s|$)`, 'gi'), ' ')
    .split(/\s+/).filter((w) => w && !FILLER.test(w)).join(' ').trim();
  return { query, qty, unit, price };
}

export function parseMessage(message, today) {
  let text = String(message || '').replace(/[“”]/g, '"').trim();
  let intent = null;
  for (const [re, name] of INTENTS) {
    const m = text.match(re);
    if (m) { intent = name; text = text.slice(m[0].length).trim(); break; }
  }

  let due_date = null; let due_raw = null;
  let r = take(text, new RegExp(`(?:กำหนดคืน|คืนวันที่|คืนภายใน|คืน|due|return\\s*by|return)\\s*(${DATE_RE})`, 'i'));
  if (r.m) { due_raw = r.m[1]; due_date = parseDate(due_raw, today, { future: true }); text = r.rest; }

  let doc_date = null; let date_raw = null;
  r = take(text, new RegExp(`(?:ลงวันที่|วันที่|date)\\s*(${DATE_RE})`, 'i'));
  if (!r.m) r = take(text, /(?:^|\s)(เมื่อวานซืน|เมื่อวาน|วานนี้|yesterday)(?=\s|$)/i);
  if (r.m) { date_raw = r.m[1]; doc_date = parseDate(date_raw, today); text = r.rest; }

  let recipient = null;
  r = take(text, /(?:ให้|(?:^|\s)to\s|(?:^|\s)for\s)\s*([^\n,]+)$/i);
  if (r.m) { recipient = r.m[1].trim(); text = r.rest; }
  else {
    r = take(text, /(แผนก\s*\S+|(?:^|\s)dept\.?\s+\S+)/i);
    if (r.m && intent !== 'receive') { recipient = r.m[1].trim(); text = r.rest; }
  }

  const segments = text.split(/\n|,|\+|\s+และ\s+|\s+and\s+/i).map((s) => s.trim()).filter(Boolean).map(parseSegment).filter((s) => s.query);
  return { intent, doc_date, date_raw, due_date, due_raw, recipient, segments };
}
