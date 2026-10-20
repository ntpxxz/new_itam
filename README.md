# AssetFlow — ระบบจัดการทรัพย์สินไอที (ITAM)

ระบบจัดการอุปกรณ์ไอทีแบบรายชิ้น (โน้ตบุ๊ก, จอ, เครื่องพิมพ์) และวัสดุสิ้นเปลืองแบบนับจำนวน (เมาส์, USB, สาย LAN, ตลับหมึก) ในทะเบียนเดียว — รับเข้า เบิกออก ยืม-คืน ส่งซ่อม จำหน่าย พร้อมประวัติและ audit ทุกรายการ

IT asset management for per-item assets and counted consumables in one register, with a full lifecycle, receive/issue slips, QR labels, reports and audit trail. Runs as a single Node process with a file-based SQLite database — no external services needed.

## ความสามารถหลัก

- **ทะเบียนอุปกรณ์เดียว** แยกตามหมวดหมู่ — รายชิ้น (รหัสทรัพย์สิน, Serial, วงจรสถานะ) หรือ นับจำนวน (สต็อก, จุดสั่งซื้อ)
- **วงจรสถานะ** พร้อมใช้ → ยืม / เบิกถาวร / ส่งซ่อม / รอจำหน่าย → Scrap (ต้องมีเหตุผลและหลักฐาน)
- **ใบรับเข้า / ใบเบิกออก** หลายรายการต่อใบ, สแกนเพิ่มรายการ, เลือกวันที่ย้อนหลังได้, พิมพ์ใบพร้อมช่องลงนาม
- **ผู้รับแบบพิมพ์เอง** — ชื่อ (ไม่บังคับ), แผนก, Section; ชื่อ/แผนกใหม่ถูกสร้างให้อัตโนมัติ
- **รายงานสรุปการเบิกตามแผนก** แยก Section และรายการ, ส่งออก Excel
- **Dashboard** สถานะ, เกินกำหนดคืน, ประกันใกล้หมด, สต็อกต่ำ, ค่าใช้จ่ายรายเดือน
- **QR** พิมพ์สติ๊กเกอร์ และสแกนด้วยกล้องมือถือหรือเครื่องสแกน USB
- **ตรวจนับสต็อก** ตามสถานที่ → พบ / ไม่พบ / เกินมา
- **นำเข้า / ส่งออก Excel**
- **สิทธิ์ละเอียด** แก้ไขบทบาทได้, ล็อกบัญชีเมื่อเข้าสู่ระบบผิด, session timeout, access log และ audit log แบบแก้ไขไม่ได้ (รองรับการลบตามระยะเก็บ PDPA)

## เริ่มใช้งาน

ต้องใช้ **Node.js ≥ 22.13** (ใช้ `node:sqlite` ในตัว ไม่ต้องติดตั้งฐานข้อมูล)

```bash
npm install
npm run seed     # สร้างข้อมูลตัวอย่าง (ล้างข้อมูลเดิมใน data/itam.db)
npm run dev      # http://localhost:3093
```

บัญชีตัวอย่างหลัง seed:

| ผู้ใช้ | รหัสผ่าน | บทบาท |
|---|---|---|
| `admin` | `Admin@1234` | Admin |
| `staff` | `Staff@1234` | IT Staff |
| `viewer` | `Viewer@1234` | Viewer (อ่านอย่างเดียว) |

> เปลี่ยนรหัสผ่านทันทีเมื่อใช้งานจริง

### Production

```bash
npm run build    # build client ไปที่ dist/
npm start        # Express เสิร์ฟ dist/ ที่พอร์ต 3093
```

- เปลี่ยนพอร์ตด้วย `PORT=8080 npm start`
- เซิร์ฟเวอร์ฟังที่ `0.0.0.0` เพื่อให้มือถือในวง LAN เปิดลิงก์จาก QR ได้ — ตั้ง URL ที่ใช้ใน QR ได้ที่หน้า ตั้งค่า
- กล้องสแกนในเบราว์เซอร์ต้องใช้ HTTPS หรือ localhost; ถ้าไม่มีให้พิมพ์รหัสหรือใช้กล้องมือถือสแกน QR แทน

## Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Server | Node.js + Express 4 (ESM) |
| Database | SQLite ผ่าน `node:sqlite` (`data/itam.db`, WAL) |
| Auth | Session ฝั่งเซิร์ฟเวอร์ + httpOnly cookie, bcryptjs |
| Client | React 18 + Vite + react-router, lucide-react |
| Fonts | Prompt (UI), IBM Plex Mono (ตัวเลข/รหัส) — โหลดในเครื่อง ใช้ใน intranet ได้ |
| อื่น ๆ | qrcode, html5-qrcode, exceljs, multer |

## โครงสร้างโปรเจกต์

```
server/
  index.js          bootstrap, security headers, Vite middleware (dev) / static (prod)
  db.js, schema.sql ฐานข้อมูล, migrations แบบเพิ่มคอลัมน์
  lifecycle.js      กฎการเปลี่ยนสถานะอุปกรณ์
  recipient.js      จับคู่/สร้าง ผู้รับ แผนก Section
  routes/           API แยกตาม resource
  seed.js           ข้อมูลตัวอย่าง
client/src/
  pages/            หน้าจอ
  components/       ส่วนประกอบ UI
  styles/tokens.css design tokens (สีทั้งหมดอยู่ที่นี่)
data/               ฐานข้อมูลและไฟล์อัปโหลด (ไม่อยู่ใน git)
```

## ข้อมูลและการสำรอง

ข้อมูลทั้งหมดอยู่ในโฟลเดอร์ `data/` (`itam.db` + `uploads/`) — สำรองโฟลเดอร์นี้โฟลเดอร์เดียวพอ ควรหยุดเซิร์ฟเวอร์ก่อนคัดลอก หรือใช้ `sqlite3 data/itam.db ".backup backup.db"`

## เอกสารเพิ่มเติม

- [`CLAUDE.md`](CLAUDE.md) — กฎของระบบ (domain rules), แนวทาง UI และ roadmap
- [`it-asset-management-ideas.md`](it-asset-management-ideas.md) — ความต้องการของระบบ
- [`UI-design.md`](UI-design.md) — design system
