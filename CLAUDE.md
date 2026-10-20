# CLAUDE.md — AssetFlow (ITAM)

ระบบจัดการทรัพย์สินไอที (IT Asset Management) เน้นอุปกรณ์รายชิ้น + วัสดุสิ้นเปลืองที่เบิกจ่ายบ่อย (เมาส์, USB, สาย LAN, ตลับหมึก)

Source of truth for requirements:
- `it-asset-management-ideas.md` — features / lifecycle / roles / logs / phases
- `UI-design.md` — design tokens, typography, components, microcopy, light-mode only

When these docs and the code disagree, the docs win unless this file says otherwise.

---

## Run

```bash
npm install
npm run dev      # http://localhost:3093  (Express + Vite middleware, one port, auto-restart on server/ changes)
npm run build    # build client into dist/
npm start        # production: Express serves dist/ on :3093
npm run seed     # wipe + re-seed demo data (data/itam.db)
```

- Port is **3093** (override with `PORT`). Listens on `0.0.0.0` so phones on the LAN can open QR links.
- Default login after seed: `admin / Admin@1234` (Admin), `staff / Staff@1234` (IT Staff), `viewer / Viewer@1234` (Viewer)
- Requires Node ≥ 22.13 (uses built-in `node:sqlite`, no native modules).

## Stack

| Layer | Choice | Why |
|---|---|---|
| Server | Node + Express 4 (ESM) | simple, one process |
| DB | SQLite via `node:sqlite` (`data/itam.db`) | zero-install, file-based, WAL |
| Auth | server-side sessions table + httpOnly cookie, `bcryptjs` | idle timeout & revoke are easy |
| Client | React 18 + Vite + react-router | SPA, served by Express |
| Icons | `lucide-react` | |
| Fonts | `@fontsource/prompt` (UI), `@fontsource/ibm-plex-mono` (numbers/IDs) | works offline / intranet |
| QR | `qrcode` (generate), `html5-qrcode` (in-app scan) | |
| Excel | `exceljs` (server) | import/export |
| Upload | `multer` → `data/uploads/` | asset images, scrap evidence |

## Layout

```
server/
  index.js            app bootstrap, security headers, vite middleware (dev) / static (prod)
  db.js               open DB, run schema.sql, helpers (tx, now)
  schema.sql          all tables, indexes, immutable-log triggers
  seed.js             demo data
  auth.js             sessions, login lockout, password policy, requirePerm()
  audit.js            audit(req, entity, id, action, before, after)
  lifecycle.js        asset status machine (single source of allowed transitions)
  routes/*.js         one router per resource
client/
  index.html
  src/main.jsx, App.jsx, api.js, auth.jsx, format.js
  src/styles/tokens.css   design tokens from UI-design.md §12 (ONLY place hex values live)
  src/styles/app.css      components
  src/components/         Layout, Sidebar, Topbar, Chip, Modal, Table bits, Toast...
  src/pages/              one file per screen
data/                 runtime (db + uploads) — gitignored
```

## Domain rules (do not break)

### Asset status machine — `server/lifecycle.js`
```
available ──borrow──▶ borrowed ──return──▶ available
available ──issue───▶ issued   ──return──▶ available
borrowed/issued ──transfer──▶ (same status, new holder/dept/location)
available ──repair_out──▶ repair ──repair_in──▶ available
repair ──to_disposal──▶ pending_disposal
available ──to_disposal──▶ pending_disposal ──cancel_disposal──▶ available
pending_disposal ──scrap (reason + evidence required)──▶ scrapped   (terminal)
available ──transfer──▶ available (location/department move)
```
- Server enforces transitions; UI only *shows* allowed actions (from `GET /api/assets/:id` → `allowedActions`).
- Every transition writes an `asset_transactions` row (= device history) **and** an audit row in the same DB transaction.
- Thai labels: พร้อมใช้ · ถูกยืม · เบิกถาวร · กำลังซ่อม · รอจำหน่าย · Scrap

### One register, split only by category
- The UI has a single **อุปกรณ์** list (`/assets`, API `GET /api/items` = UNION of both tables) and one add form (`/assets/new`).
- `categories.kind` decides tracking: `asset` = รายชิ้น (tag, serial, lifecycle) · `consumable` = นับจำนวน (stock). There is no separate consumables menu.
- Storage stays in two tables (`assets`, `consumables`) because their workflows differ. Detail pages: `/assets/:id` and `/consumables/:id`; edit: `/assets/:id/edit`, `/consumables/:id/edit` (same form).
- A category's `kind` cannot change while it has items.

### Receive / issue slips (รับเข้า / เบิกออก) — `server/routes/documents.js`, pages `/receive`, `/issue`, `/documents/:id`
- A slip (`documents` table, `RCV-YYYYMM-0001` / `ISS-YYYYMM-0001`) holds many lines mixing รายชิ้น and นับจำนวน. Lines are the normal history rows (`asset_transactions` / `stock_movements`) tagged with `doc_id`.
- All lines apply in **one DB transaction** — any invalid line rolls back the whole slip; errors say `รายการที่ N: …`.
- Receive: นับจำนวน → `moveStock('in')`; รายชิ้น → `createAsset()` once per unit (serials optional, ≤200/line).
- Receive date (`doc_date`) may be backdated (not future); optional slip `purchase_date` must be ≤ `doc_date` and defaults to it. Slip number month and asset-tag year follow those dates.
- Issue: mode `issue` (เบิกถาวร) or `borrow` (due date). Assets → `applyAction()`; consumables → `moveStock('out')`. Consumables cannot be borrowed.
- Issue date (`doc_date`) may be backdated: not in the future, and for each asset not before its `received_date` or latest movement. Borrow due date must be ≥ `doc_date`. History rows keep `created_at` as the record time; the effective date comes from `documents.doc_date` (shown as วันที่ … · บันทึก …).
- Always reuse `applyAction` / `createAsset` / `moveStock` so rules, history and audit stay in one place.

### Recipients: free text name + แผนก — `server/recipient.js`
- Borrow / issue / transfer / stock-out take **typed** `person_name`, `department_name` (UI: `RecipientFields`, inputs with datalist suggestions — no dropdowns).
- **Name is optional.** A recipient needs a name **or** a department (แผนก) — issuing to a department as a whole leaves `holder_person_id` NULL. Stock-out from the item page needs neither.
- "Section" = แผนก (per user). There is no separate section field; the legacy `section` / `holder_section` columns stay in the schema (additive migrations) but are unused.
- `resolveRecipient()` links an exact (case-insensitive) name/department to the existing record, otherwise creates it (audited), so reports group correctly.
- Display holders with `who(name, department)` (person, else department) and `isHeld(asset)` from `client/src/format.js`.

### Report: สรุปการเบิกตามแผนก — `/reports/issues`, `server/routes/reports.js`
- Counts asset `issue`/`borrow` transactions and consumable `out` movements by effective date (slip `doc_date`, else local record date), grouped by department → item / recipient; Excel export (3 sheets: by department, by recipient, line detail).
- Value: assets = purchase price, consumables = qty × current unit cost. Permission `report.view` (+ `report.export` for Excel).
- New permissions are granted to default roles on existing DBs by `bootstrap()` (only keys added in that version).

### Received date (วันที่รับเข้า)
- `assets.received_date` (defaults to today, not future, not before `purchase_date`) and `stock_movements.received_date` for `in` rows (opening stock + every รับเข้า).
- Monthly consumable spend on the dashboard uses `received_date`.
- Schema changes to existing tables go through `addColumn()` in `server/db.js` (additive migrations).

### Consumables
- Quantity-based (`qty_on_hand`), never per-item. Movements: `in` (รับเข้า), `out` (เบิก), `adjust` (ปรับยอด/ตรวจนับ).
- `out` cannot drive stock below 0. Low stock = `qty_on_hand <= reorder_point` → dashboard alert + sidebar badge.

### Data integrity
- **Soft delete only** (`deleted_at`) for assets, consumables, people, users, master data. Never `DELETE` business rows.
- Asset tags auto-generated: `<category.prefix>-<YYYY>-<00001>` (e.g. `NB-2026-00012`). Consumable SKU: `C-<prefix>-<0001>`.
- `audit_logs` and `access_logs` are append-only — SQLite triggers abort UPDATE, and abort DELETE unless the row is older than `settings.log_retention_days` (PDPA retention purge runs daily on boot/interval).

### Permissions
- Permission keys are fine-grained (`asset.view`, `asset.create`, `asset.transact`, `asset.scrap`, `user.manage`, …). Roles are just bundles editable in UI (`/admin/roles`).
- Server: `requirePerm('asset.edit')` on every mutating route. Client: `can('asset.edit')` only hides UI.
- Seeded roles: **Admin** (all), **IT Staff** (all except user/role/settings), **Viewer** (read-only).

### Auth security
- Lock account 15 min after 5 failed logins; password ≥ 8 chars with letter + digit; idle session timeout 30 min (sliding); cookie `httpOnly; SameSite=Strict`.
- Access log: login / logout / login_failed / locked, with IP + user-agent.
- Not implemented yet (future): 2FA, AD/LDAP/SSO.

## UI rules (from UI-design.md — enforce in review)
- **Light mode only.** No dark-mode CSS.
- Colors only via CSS variables in `tokens.css`. Indigo `--brand` = primary only, never "success".
- One `.btn-primary` per screen.
- Status always = chip (dot + text), never color alone. Use `<StatusChip status=…>`.
- Fonts: **Prompt** (UI — overrides UI-design.md §3 per user request), IBM Plex Mono + `tabular-nums` for tags, numbers, KPIs, pagination.
- Weights 400 and 500/600 only. Spacing on 4px scale.
- Layout: sidebar 240px + sticky topbar 60px, content max 1440px; breakpoints 1100 / 900 / 760 (hamburger) / 460.
- Touch targets ≥ 44px on mobile; icon buttons 36px with `aria-label`.
- Motion: 100ms hover, 200ms sidebar; disable under `prefers-reduced-motion`.
- Dates in UI: `15 ก.ค. 2027` → use `fmtDate()` in `client/src/format.js` (th-TH, Gregorian year). DB stores ISO.
- Microcopy: Thai, direct verbs (บันทึก, ยืม, คืน, ส่งซ่อม). Errors say what went wrong + what to do. Errors → toast; actionable summaries → alert row.

## Conventions
- API: JSON under `/api/*`; errors `{ error: "ข้อความภาษาไทย" }` with proper status codes. List endpoints return `{ rows, total, page, pageSize }`.
- SQL: always parameterized (`?`). Wrap multi-statement writes in `tx()`.
- Keep comments sparse; name things clearly instead.

---

## Plan / Roadmap

### Phase 1 — MVP ✅ (this build)
- [x] Login, sessions, lockout, password policy, idle timeout, logout
- [x] Roles + fine-grained permissions (editable matrix), user management
- [x] Master data: categories (asset/consumable + tag prefix), locations/branches, departments, vendors, people (ผู้ยืม/พนักงาน)
- [x] Asset CRUD (tag auto, serial, brand/model, specs, price, PO/invoice, purchase date, vendor, warranty, image) + soft delete
- [x] Lifecycle actions: borrow (due date) / return / issue / transfer / repair out-in / to disposal / scrap with evidence
- [x] Asset history timeline, access log, audit trail (before/after diff)
- [x] Consumables: stock in / issue out / adjust, reorder point
- [x] Unified register (assets + consumables in one list, split by category) · received date field
- [x] รับเข้า / เบิกออก menus: multi-line slips, scan-to-add, printable slip with signature lines
- [x] Backdated issue/receive dates · free-text recipient with optional name + แผนก · report สรุปการเบิกตามแผนก

### Phase 2 ✅ (this build)
- [x] Dashboard: KPI by status, overdue returns, warranty ≤ 30 days, low stock, monthly purchase spend, activity feed
- [x] QR labels (print sheet) — QR encodes `http://<host>:3093/a/<TAG>` so a phone camera opens the asset directly
- [x] In-app scanner page (camera when on HTTPS/localhost, manual tag entry fallback)
- [x] Excel export (assets, consumables, history) + import assets from template

### Phase 3
- [x] Stock count sessions: scan per location → summary of found / missing / unexpected
- [ ] Approval workflow for borrow/issue requests (end-user self-service)
- [ ] Email/LINE notifications for overdue & warranty
- [ ] 2FA, AD/SSO
- [ ] Maintenance cost tracking per repair, depreciation
