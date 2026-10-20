// UI-design.md §10: dates as "15 ก.ค. 2027" (Thai month, Gregorian year)
const dateFmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { hour: '2-digit', minute: '2-digit', hour12: false });
const monthFmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { month: 'short' });
const numFmt = new Intl.NumberFormat('th-TH');
const moneyFmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// DB timestamps ("YYYY-MM-DD HH:MM:SS") are UTC; date-only fields are local calendar dates.
export function parse(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); }
  return new Date(v.replace(' ', 'T') + (v.endsWith('Z') ? '' : 'Z'));
}

// Local calendar date (YYYY-MM-DD) of a UTC DB timestamp
export const fmtISODate = (v) => { const d = parse(v); return d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null; };
export const fmtDate = (v) => (v ? dateFmt.format(parse(v)) : '—');
export const fmtDateTime = (v) => (v ? `${dateFmt.format(parse(v))} ${timeFmt.format(parse(v))}` : '—');
export const fmtMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return monthFmt.format(new Date(y, m - 1, 1)); };
export const fmtNum = (n) => (n === null || n === undefined ? '—' : numFmt.format(n));
export const fmtMoney = (n) => (n === null || n === undefined || n === '' ? '—' : `฿${moneyFmt.format(n)}`);
export const fmtMoneyShort = (n) => {
  if (!n) return '฿0';
  if (n >= 1e6) return `฿${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `฿${(n / 1e3).toFixed(0)}K`;
  return `฿${moneyFmt.format(n)}`;
};

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addDaysISO(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function daysFromToday(isoDate) {
  if (!isoDate) return null;
  const t = parse(todayISO());
  return Math.round((parse(isoDate) - t) / 86400000);
}

export function relative(v) {
  const d = parse(v);
  if (!d) return '';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} วันที่แล้ว`;
  return fmtDate(v);
}

// Recipient label: name and/or section (name is optional)
export const who = (name, section) => [name, section].filter(Boolean).join(' · ');

export const initials =(name = '') => name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
