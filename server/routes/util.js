import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { UPLOAD_DIR } from '../db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (msg) => new HttpError(400, msg);
export const notFound = (what = 'ข้อมูล') => new HttpError(404, `ไม่พบ${what} อาจถูกลบไปแล้ว`);

export function paging(req, defaultSize = 20) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const likeTerm = (q) => `%${String(q).trim().replace(/[%_]/g, (m) => '\\' + m)}%`;

export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const isDate =(s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
export const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
export const toInt = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10));

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EVIDENCE_TYPES = [...IMAGE_TYPES, 'application/pdf'];

function makeUpload(types) {
  return multer({
    storage: multer.diskStorage({
      destination: UPLOAD_DIR,
      filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => (types.includes(file.mimetype)
      ? cb(null, true)
      : cb(bad('ไฟล์ไม่รองรับ — ใช้ได้เฉพาะ ' + (types.includes('application/pdf') ? 'รูปภาพหรือ PDF' : 'รูปภาพ JPG, PNG, WEBP')))),
  });
}
export const uploadImage = makeUpload(IMAGE_TYPES);
export const uploadEvidence = makeUpload(EVIDENCE_TYPES);
export const uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
