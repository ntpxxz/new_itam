# CLAUDE.md — IT Store (ITAM)

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
npm run seed     # wipe + re-seed demo data (data/it_storage.db; on SQL Server it refuses unless `-- --force`)
npm run import-stock -- a.csv b.csv   # load opening consumable stock from inventory CSV exports (skips existing SKUs)
npm run schema:empty   # regenerate docs/create-empty-db.sql (schema + permissions/roles/settings, no users)
npm run migrate:mssql -- data/it_storage.db [--replace] [--dry-run]   # copy a SQLite DB into the SQL Server DB from .env, keeping ids
```

- Docker: `docker compose up -d --build` → production build on **http://192.168.101.225:3053** (bind IP = `BIND_IP` in `.env`; `Dockerfile`, `docker-compose.yml`; reads `.env`, data in volume `itam-data`, `MSSQL_SERVER` defaults to `host.docker.internal` — override with `DOCKER_MSSQL_SERVER`).
- Port is **3093** (override with `PORT`). Listens on `0.0.0.0` so phones on the LAN can open QR links.
- Default login after seed: `admin / Admin@1234` (Admin), `staff / Staff@1234` (IT Staff), `viewer / Viewer@1234` (Viewer)
- Requires Node ≥ 22.13 (uses built-in `node:sqlite`, no native modules).
- Database is chosen in `.env`: `DB_CLIENT=sqlite` (default) or `DB_CLIENT=mssql` + `MSSQL_SERVER/PORT/DATABASE/USER/PASSWORD` (SQL login; create it with `docs/create-app-login.mssql.sql`). On SQL Server, tables are created on start from `server/schema.mssql.sql`; `npm run seed` drops and recreates every table.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Server | Node + Express 4 (ESM) | simple, one process |
| DB | SQLite via `node:sqlite` (`data/it_storage.db`) **or** SQL Server via `mssql` (`DB_CLIENT` in `.env`) | zero-install default; SQL Server for central hosting |
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
  db.js               driver (sqlite | mssql), async all/get/run/tx, SQLite→T-SQL rewrite, ym()/localDate()/dateOf()
  schema.sql          all tables, indexes, immutable-log triggers (SQLite)
  schema.mssql.sql    same schema for SQL Server (idempotent, run on start)
  async-routes.js     forwards rejected async handlers to the Express error middleware
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
- The list has a type filter (ทั้งหมด / รายชิ้น / วัสดุสิ้นเปลือง → `?kind=asset|consumable` on `GET /api/items` and `/api/items/export`); it narrows the category and status choices to that type.
- Storage stays in two tables (`assets`, `consumables`) because their workflows differ. Detail pages: `/assets/:id` and `/consumables/:id`; edit: `/assets/:id/edit`, `/consumables/:id/edit` (same form).
- A category's `kind` cannot change while it has items.

### Receive / issue slips (รับเข้า / เบิกออก) — `server/routes/documents.js`, pages `/receive`, `/issue`, `/documents/:id`
- A slip (`documents` table, `RCV-YYYYMM-0001` / `ISS-YYYYMM-0001`) holds many lines mixing รายชิ้น and นับจำนวน. Lines are the normal history rows (`asset_transactions` / `stock_movements`) tagged with `doc_id`.
- All lines apply in **one DB transaction** — any invalid line rolls back the whole slip; errors say `รายการที่ N: …`.
- Receive: นับจำนวน → `moveStock('in')`; รายชิ้น → `createAsset()` once per unit (serials optional, ≤200/line).
- Receive "รายการใหม่" line: the category picker lists **both** kinds; the chosen category decides the line. รายชิ้น → new assets; นับจำนวน → `createConsumable()` (SKU barcode, unit, reorder point; needs `consumable.manage`) then `moveStock('in')`, same transaction.
- Receive date (`doc_date`) may be backdated (not future); optional slip `purchase_date` must be ≤ `doc_date` and defaults to it. Slip number month and asset-tag year follow those dates.
- Issue: mode `issue` (เบิกถาวร) or `borrow` (due date). Assets → `applyAction()`; consumables → `moveStock('out')`. Consumables cannot be borrowed.
- Issue date (`doc_date`) may be backdated: not in the future, and for each asset not before its `received_date` or latest movement. Borrow due date must be ≥ `doc_date`. History rows keep `created_at` as the record time; the effective date comes from `documents.doc_date` (shown as วันที่ … · บันทึก …).
- Always reuse `applyAction` / `createAsset` / `moveStock` so rules, history and audit stay in one place.

### รายการรอรับเข้า (pending receipts) — `server/routes/pending.js` (`/api/pending-receipts`), page `/pending-receive`
- Upload a CSV (browser parses it in `client/src/csv.js`: Barcode/SKU + Quantity required; Name, Unit Price optional; UTF-8/UTF-16/Windows-874) → rows are stored in `pending_batches` / `pending_receipts` (status `pending`). **Uploading never changes stock.**
- Every non-empty row is kept. Each line's `state` is computed when listed: `ready` (SKU matches a consumable) · `new` (SKU not in the system → "สร้างรายการใหม่" dialog on the page creates the consumable with stock 0, or the full form `/assets/new?sku=&name=&unit_cost=`) · `incomplete` (no SKU, SKU with spaces, no qty, or an existing per-unit asset; `problem` says why). SKU/qty/price are edited in the row; only `ready` lines can be received.
- Approved ใบสั่งซื้อ lines arrive here too (`order_line_id`, shown with the order no.): consumables match by SKU; per-unit asset lines (no SKU) are always ready and create new asset units on receipt (needs `asset.create`). Their SKU can't be edited; qty/price can.
- Anyone with `consumable.move` can come back later, tick ready lines and receive them: one RCV slip via `createReceiveDoc()` (shared with `/receive`), then the lines become `received` with `doc_id`, in the same transaction. Lines can be edited (SKU/qty/price) or `cancelled` while pending; ลบ soft-deletes pending/cancelled lines (`deleted_at`, hidden from every tab, audited) — received lines can't be deleted. Sidebar badge `pendingReceive`.

### ใบสั่งซื้อ (purchase orders / cart) — `server/routes/orders.js` (`/api/orders`), pages `/shop`, `/cart`, `/orders`, `/orders/:id`
- A **purchase order**, not a requisition: a user with `order.create` (role **ผู้สั่งซื้อ**, key `requester`, has only this) picks any **registered** item into a cart on `/shop` — **stock level never limits it** (0 is fine; per line ≤ 9999, assets ≤ 200). Reviews it on `/cart` (recipient, note, estimate from last price; topbar cart icon shows the count; cart = `client/src/cart.js`, localStorage) and sends `ORD-YYYYMM-0001` (`pending`). Unregistered items can't be ordered.
- Catalog (`GET /api/orders/catalog`) = all consumables + per-unit assets grouped by category/name/brand/model (non-scrapped), with `on_hand` (info only) and `last_price`. Lines store that group plus `unit_price`.
- `order.manage` approves (may lower quantities, 0 = not approved) or rejects (reason required). **Approving moves the approved lines to รายการรอรับเข้า**: one `pending_batches` row (note `ใบสั่งซื้อ ORD-…`) + one `pending_receipts` row per line with `order_line_id`, same transaction. The goods are received only there (normal RCV slip; PO no. defaults to the order no.).
- **Handover (ส่งมอบ)**: once no line still waits in รอรับเข้า, a manager presses ส่งมอบให้ผู้สั่ง → `/issue?order=<id>` pre-filled from `GET /api/orders/:id/handover` (order recipient; received consumables capped at stock; the asset units that line's RCV created, still available; `short` lists anything missing). Lines stay editable. Saving posts to `POST /api/orders/:id/handover` → `createIssueDoc()` (mode always `issue`) and marks the order `delivered` (`delivered_by/at`, `doc_id` = the ISS slip) in one transaction.
- Order tabs: ทั้งหมด / รอตรวจสอบ / อนุมัติแล้ว / ไม่อนุมัติ / ยกเลิก (delivered orders show under ทั้งหมด; `?status=delivered` works in the API). The order page shows each line's receipt state (รอรับเข้า / รับเข้าแล้ว + RCV no. / ยกเลิก). Cancel: requester while `pending`; managers also while `approved` if no line was received yet — its waiting lines are cancelled too.
- Old databases may hold unused `orders.received_by/received_at/receive_doc_id` columns from an earlier version.
- Users without `order.manage` see only their own orders. Sidebar badge `pendingOrders` = orders waiting for approval (managers); approved lines count in `pendingReceive`.
- `db.js` turns `''` params into NULL, so `brand`/`model` (NOT NULL DEFAULT '') are written and matched with `COALESCE(?, '')`.

### Recipients: free text name + แผนก — `server/recipient.js`
- Borrow / issue / transfer / stock-out take **typed** `person_name`, `department_name` (UI: `RecipientFields`, inputs with datalist suggestions — no dropdowns).
- **Name is optional.** A recipient needs a name **or** a department (แผนก) — issuing to a department as a whole leaves `holder_person_id` NULL. Stock-out from the item page needs neither.
- "Section" = แผนก (per user). There is no separate section field.
- People (พนักงาน) = name + แผนก only — no employee code, email or phone. Users have no email; login is username + password only. Older databases may still carry unused `people.emp_code`, `people.email`, `people.phone`, `users.email` columns; new databases don't. Older databases (e.g. `itam.db`) may still carry unused `section` / `holder_section` columns; new databases don't have them.
- `resolveRecipient()` links an exact (case-insensitive) name/department to the existing record, otherwise creates it (audited), so reports group correctly.
- Display holders with `who(name, department)` (person, else department) and `isHeld(asset)` from `client/src/format.js`.

### Report: สรุปการเบิกตามแผนก — `/reports/issues`, `server/routes/reports.js`
- Counts asset `issue`/`borrow` transactions and consumable `out` movements by effective date (slip `doc_date`, else local record date), grouped by department → item / recipient; Excel export (3 sheets: by department, by recipient, line detail).
- Value: assets = purchase price, consumables = qty × current unit cost. Permission `report.view` (+ `report.export` for Excel).
- New permissions are granted to default roles on existing DBs by `bootstrap()` (only keys added in that version).

### Chat assistant (ผู้ช่วยบันทึกรายการ) — `server/assistant-parse.js`, `server/routes/assistant.js`, `client/src/components/AssistantChat.jsx`
- Floating chat (bottom-right, every page) for users with `asset.create` / `consumable.move` / `asset.transact`. **Rule-based, no AI, no external calls** (user chose free/offline).
- Grammar: `รับเข้า|เบิก|ยืม` (or receive/issue/borrow) + items (`<name or code> <qty> [unit] [@price]`, split by `,` / `และ` / `and`) + `ให้ <name> [แผนก<dept>]` + `คืน <date>` + `วันที่ <date>|เมื่อวาน`. Dates: `15/11`, `15/11/69` (พ.ศ.), `5 พ.ย.`, `2026-11-15`, `อีก 7 วัน`.
- `assistant-parse.js` is pure text parsing; the route resolves items (exact SKU/tag/serial first, then all-words match), checks stock/status, and returns a **draft** or Thai problems + `choices` (buttons that resend the request with a precise code).
- The assistant never writes. The user presses บันทึก on the draft card and the client posts it to `/api/documents/receive|issue`, so slip rules, history and audit stay in `documents.js`. Receiving brand-new per-unit assets stays on `/receive` (needs category/serials).

### Received date (วันที่รับเข้า)
- `assets.received_date` (defaults to today, not future, not before `purchase_date`) and `stock_movements.received_date` for `in` rows (opening stock + every รับเข้า).
- Monthly consumable spend on the dashboard uses `received_date`.
- Schema changes to existing tables go through `addColumn()` in `server/db.js` (additive migrations).

### Consumables
- Quantity-based (`qty_on_hand`), never per-item. Movements: `in` (รับเข้า), `out` (เบิก), `adjust` (ปรับยอด/ตรวจนับ).
- `out` cannot drive stock below 0. Low stock = `qty_on_hand <= reorder_point` → dashboard alert + sidebar badge.

### Data integrity
- **Soft delete only** (`deleted_at`) for assets, consumables, people, users, master data. Never `DELETE` business rows.
- Asset tags auto-generated: `<category.prefix>-<YYYY>-<00001>` (e.g. `NB-2026-00012`). Consumable SKU = the product's **barcode**, typed/scanned by the user (required, unique incl. soft-deleted, no spaces, ≤ 64 chars, editable) — never auto-generated. Scanning a SKU in รับเข้า/เบิกออก or `/scan` finds the consumable.
- `audit_logs` and `access_logs` are append-only — SQLite triggers abort UPDATE, and abort DELETE unless the row is older than `settings.log_retention_days` (PDPA retention purge runs daily on boot/interval).

### Permissions
- Permission keys are fine-grained (`asset.view`, `asset.create`, `asset.transact`, `asset.scrap`, `user.manage`, …). Roles are just bundles editable in UI (`/admin/roles`).
- Server: `requirePerm('asset.edit')` on every mutating route. Client: `can('asset.edit')` only hides UI.
- Seeded roles: **Admin** (all), **IT Staff** (all except user/role/settings), **Viewer** (read-only), **ผู้สั่งซื้อ** (`order.create` only — lands on `/shop`).
- Menus with their own permission: ยืม-คืน `loan.view`, ประวัติรายการ `history.view`, สแกน QR `scan.use`, พิมพ์สติ๊กเกอร์ `label.print`, พนักงาน `people.view` / `people.manage` (writes to `/api/master/people`; other master tables stay `master.manage`). Their data still comes from asset APIs, so they also need `asset.view`.
- A permission split out of an older one is listed in `SPLIT_FROM` (`server/permissions.js`); `bootstrap()` grants it to every role holding the older key, so upgrades don't remove access.

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
- SQL: always parameterized (`?`). Wrap multi-statement writes in `await tx(async () => …)`. `all/get/run` are async — always `await` them, and never run queries in parallel inside `tx()`.
- SQL must run on both SQLite and SQL Server: write SQLite syntax with `?`; `db.js` rewrites `?`, `LIMIT/OFFSET` (needs ORDER BY), `COLLATE NOCASE`, `length()`. Do date math in JS (`today()`, `addDays()`, `monthStart()`, `minutesAgo()`) and pass it as a parameter; use `ym()` / `localDate()` / `dateOf()` for the rest. No `ON CONFLICT`, `INSERT OR`, `IS NOT ?`, `||`, boolean expressions in SELECT (use CASE), `rowid`; alias derived tables; quote the `key` column as `"key"`.
- Schema changes: update `schema.sql` (+ `addColumn()`) **and** `schema.mssql.sql`.
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

### Phase 3 ✅ (this build)
- [x] Stock count sessions: scan per location → summary of found / missing / unexpected
- [x] Chat assistant (rule-based, offline): type a receive/issue/borrow request → reviewed draft slip → บันทึก
- [x] รายการรอรับเข้า: CSV upload → pending lines → receive later as one RCV slip
- [x] ใบสั่งซื้อ: end-user cart (any stock level) → admin approve/reject → approved lines go to รอรับเข้า → RCV slip → ส่งมอบ (ISS slip)
- [x] Consumable SKU = barcode · item photos · opening stock import (`import-stock`)
- [x] SQL Server driver + `migrate:mssql` · Docker deployment

### Before merging to main (verification debt)
- [ ] Click through `/shop` → `/cart` → `/orders/:id` (approve / reject / cancel) → `/pending-receive` → RCV → ส่งมอบ in a browser, desktop + 460px phone width
- [ ] Run order approve + receive on SQL Server (a scratch database, never the live one), incl. an older DB with `delivered` orders
- [ ] Regenerate `docs/create-empty-db.mssql.sql` (out of date)

### Phase 4 — next, in priority order
Prefer free / offline options (no paid APIs, intranet only).
1. [x] **Hand over a received order** — `/orders/:id` → `/issue?order=` pre-filled → ISS slip, order `delivered`.
2. [ ] **Requester notifications in-app** — bell in the topbar: order approved / rejected / received. Stored in a `notifications` table; no external service.
3. [ ] **Self-service borrow requests** — same cart + approval flow with mode `borrow` and a due date; approval runs `applyAction('borrow')` via `createIssueDoc`.
4. [ ] **Overdue & warranty reminders** — daily job (like the PDPA purge) → in-app list first; optional email through the organisation's own SMTP. (LINE Notify was shut down in 2025; LINE would need the Messaging API.)
5. [ ] **Repair cost per job** — cost, vendor, invoice on `repair_in`; total per asset on the detail page and in reports.
6. [ ] **Depreciation** — straight-line by category life (years) → book value on the asset page + Excel export.
7. [ ] **Automated tests** — turn the scratch e2e scripts (orders, pending receipts, slips) into `npm test` against a temp SQLite DB.

### Later
- [ ] 2FA (TOTP, offline authenticator apps)
- [ ] AD / LDAP login (only if the organisation provides it)
