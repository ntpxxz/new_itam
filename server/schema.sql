PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  key   TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  grp   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id  INTEGER NOT NULL REFERENCES roles(id),
  perm_key TEXT NOT NULL REFERENCES permissions(key),
  PRIMARY KEY (role_id, perm_key)
);

CREATE TABLE IF NOT EXISTS departments (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS locations (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  branch     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('asset','consumable')),
  prefix     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS vendors (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS people (
  id            INTEGER PRIMARY KEY,
  emp_code      TEXT,
  name          TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  email         TEXT,
  phone         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  email           TEXT,
  role_id         INTEGER NOT NULL REFERENCES roles(id),
  is_active       INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  password_changed_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id               INTEGER PRIMARY KEY,
  asset_tag        TEXT UNIQUE NOT NULL,
  category_id      INTEGER NOT NULL REFERENCES categories(id),
  name             TEXT NOT NULL,
  brand            TEXT,
  model            TEXT,
  serial_no        TEXT,
  specs            TEXT,
  status           TEXT NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available','borrowed','issued','repair','pending_disposal','scrapped')),
  location_id      INTEGER REFERENCES locations(id),
  holder_person_id INTEGER REFERENCES people(id),
  holder_section   TEXT,
  department_id    INTEGER REFERENCES departments(id),
  due_date         TEXT,
  purchase_date    TEXT,
  purchase_price   REAL,
  po_number        TEXT,
  invoice_number   TEXT,
  vendor_id        INTEGER REFERENCES vendors(id),
  warranty_expiry  TEXT,
  received_date    TEXT,
  image_path       TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_serial ON assets(serial_no);

-- Receive / issue slips (ใบรับเข้า / ใบเบิก). Lines live in asset_transactions + stock_movements via doc_id.
CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY,
  doc_no        TEXT UNIQUE NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('receive','issue')),
  doc_date      TEXT NOT NULL,
  mode          TEXT,
  person_id     INTEGER REFERENCES people(id),
  department_id INTEGER REFERENCES departments(id),
  location_id   INTEGER REFERENCES locations(id),
  vendor_id     INTEGER REFERENCES vendors(id),
  section       TEXT,
  po_number     TEXT,
  invoice_number TEXT,
  due_date      TEXT,
  note          TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(type, doc_date);

CREATE TABLE IF NOT EXISTS asset_transactions (
  id            INTEGER PRIMARY KEY,
  asset_id      INTEGER NOT NULL REFERENCES assets(id),
  action        TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  person_id     INTEGER REFERENCES people(id),
  department_id INTEGER REFERENCES departments(id),
  location_id   INTEGER REFERENCES locations(id),
  section       TEXT,
  due_date      TEXT,
  note          TEXT,
  evidence_path TEXT,
  cost          REAL,
  performed_by  INTEGER REFERENCES users(id),
  doc_id        INTEGER REFERENCES documents(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_atx_asset ON asset_transactions(asset_id, created_at);

CREATE TABLE IF NOT EXISTS consumables (
  id            INTEGER PRIMARY KEY,
  sku           TEXT UNIQUE NOT NULL,
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'ชิ้น',
  qty_on_hand   INTEGER NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  reorder_point INTEGER NOT NULL DEFAULT 0,
  location_id   INTEGER REFERENCES locations(id),
  unit_cost     REAL,
  vendor_id     INTEGER REFERENCES vendors(id),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id             INTEGER PRIMARY KEY,
  consumable_id  INTEGER NOT NULL REFERENCES consumables(id),
  type           TEXT NOT NULL CHECK (type IN ('in','out','adjust')),
  qty            INTEGER NOT NULL,
  balance_after  INTEGER NOT NULL,
  person_id      INTEGER REFERENCES people(id),
  department_id  INTEGER REFERENCES departments(id),
  section        TEXT,
  unit_cost      REAL,
  received_date  TEXT,
  note           TEXT,
  performed_by   INTEGER REFERENCES users(id),
  doc_id         INTEGER REFERENCES documents(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sm_cons ON stock_movements(consumable_id, created_at);

CREATE TABLE IF NOT EXISTS stock_counts (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  location_id INTEGER REFERENCES locations(id),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at   TEXT
);

CREATE TABLE IF NOT EXISTS stock_count_scans (
  id          INTEGER PRIMARY KEY,
  count_id    INTEGER NOT NULL REFERENCES stock_counts(id),
  asset_id    INTEGER REFERENCES assets(id),
  raw_code    TEXT NOT NULL,
  scanned_by  INTEGER REFERENCES users(id),
  scanned_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (count_id, raw_code)
);

CREATE TABLE IF NOT EXISTS access_logs (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER,
  username   TEXT,
  event      TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_access_created ON access_logs(created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER,
  username   TEXT,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  action     TEXT NOT NULL,
  before_json TEXT,
  after_json  TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- Logs are append-only. Deletion is allowed only for rows past the PDPA retention window.
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END;

CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs
WHEN OLD.created_at > datetime('now', '-' || COALESCE((SELECT value FROM settings WHERE key = 'log_retention_days'), '3650') || ' days')
BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END;

CREATE TRIGGER IF NOT EXISTS access_no_update BEFORE UPDATE ON access_logs
BEGIN SELECT RAISE(ABORT, 'access_logs is immutable'); END;

CREATE TRIGGER IF NOT EXISTS access_no_delete BEFORE DELETE ON access_logs
WHEN OLD.created_at > datetime('now', '-' || COALESCE((SELECT value FROM settings WHERE key = 'log_retention_days'), '3650') || ' days')
BEGIN SELECT RAISE(ABORT, 'access_logs is immutable'); END;

CREATE TRIGGER IF NOT EXISTS atx_no_update BEFORE UPDATE ON asset_transactions
BEGIN SELECT RAISE(ABORT, 'asset history is immutable'); END;

CREATE TRIGGER IF NOT EXISTS atx_no_delete BEFORE DELETE ON asset_transactions
BEGIN SELECT RAISE(ABORT, 'asset history is immutable'); END;
