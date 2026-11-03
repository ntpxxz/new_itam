-- IT Store (ITAM) — create an empty database on Microsoft SQL Server (2016+)
-- T-SQL port of docs/create-empty-db.sql (SQLite). Same tables, indexes, reference data and immutable-log triggers.
-- Usage: open in SSMS and Execute (F5), or:  sqlcmd -S <server> -E -i docs\create-empty-db.mssql.sql
-- NOTE: the app itself still runs on SQLite (node:sqlite). This database is not used by the app unless the server is ported.
-- Contains no users. Timestamps are UTC (SYSUTCDATETIME), like SQLite datetime('now').

IF DB_ID(N'ITAM') IS NULL
  CREATE DATABASE ITAM COLLATE Thai_100_CI_AS;
GO
USE ITAM;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;   -- required for filtered indexes (sqlcmd defaults it OFF)
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- TABLES (in foreign-key order)

CREATE TABLE departments (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(200) NOT NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at DATETIME2(0) NULL
);

CREATE TABLE locations (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(200) NOT NULL,
  branch     NVARCHAR(200) NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at DATETIME2(0) NULL
);

CREATE TABLE vendors (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(200) NOT NULL,
  contact    NVARCHAR(200) NULL,
  phone      NVARCHAR(50)  NULL,
  email      NVARCHAR(200) NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at DATETIME2(0) NULL
);

CREATE TABLE categories (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(200) NOT NULL,
  kind       NVARCHAR(20)  NOT NULL CHECK (kind IN ('asset','consumable')),
  prefix     NVARCHAR(20)  NOT NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at DATETIME2(0) NULL
);

CREATE TABLE permissions (
  [key] NVARCHAR(64)  PRIMARY KEY,
  name  NVARCHAR(200) NOT NULL,
  grp   NVARCHAR(100) NOT NULL
);

CREATE TABLE roles (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  [key]       NVARCHAR(64)  NOT NULL UNIQUE,
  name        NVARCHAR(200) NOT NULL,
  description NVARCHAR(500) NULL,
  is_system   BIT NOT NULL DEFAULT 0
);

CREATE TABLE role_permissions (
  role_id  INT          NOT NULL REFERENCES roles(id),
  perm_key NVARCHAR(64) NOT NULL REFERENCES permissions([key]),
  PRIMARY KEY (role_id, perm_key)
);

CREATE TABLE settings (
  [key] NVARCHAR(64)   PRIMARY KEY,
  value NVARCHAR(1000) NOT NULL
);

CREATE TABLE users (
  id                  INT IDENTITY(1,1) PRIMARY KEY,
  username            NVARCHAR(100) NOT NULL UNIQUE,   -- case-insensitive via Thai_100_CI_AS
  password_hash       NVARCHAR(200) NOT NULL,
  full_name           NVARCHAR(200) NOT NULL,
  role_id             INT NOT NULL REFERENCES roles(id),
  is_active           BIT NOT NULL DEFAULT 1,
  failed_attempts     INT NOT NULL DEFAULT 0,
  locked_until        DATETIME2(0) NULL,
  last_login_at       DATETIME2(0) NULL,
  password_changed_at DATETIME2(0) NULL,
  created_at          DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at          DATETIME2(0) NULL
);

CREATE TABLE sessions (
  id         NVARCHAR(128) PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  ip         NVARCHAR(64)  NULL,
  user_agent NVARCHAR(500) NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  last_seen  DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE people (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  name          NVARCHAR(200) NOT NULL,
  department_id INT NULL REFERENCES departments(id),
  created_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at    DATETIME2(0) NULL
);

CREATE TABLE documents (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  doc_no         NVARCHAR(32) NOT NULL UNIQUE,
  type           NVARCHAR(20) NOT NULL CHECK (type IN ('receive','issue')),
  doc_date       DATE NOT NULL,
  mode           NVARCHAR(20) NULL,
  person_id      INT NULL REFERENCES people(id),
  department_id  INT NULL REFERENCES departments(id),
  location_id    INT NULL REFERENCES locations(id),
  vendor_id      INT NULL REFERENCES vendors(id),
  po_number      NVARCHAR(100) NULL,
  invoice_number NVARCHAR(100) NULL,
  due_date       DATE NULL,
  note           NVARCHAR(MAX) NULL,
  created_by     INT NULL REFERENCES users(id),
  created_at     DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE assets (
  id               INT IDENTITY(1,1) PRIMARY KEY,
  asset_tag        NVARCHAR(50)  NOT NULL UNIQUE,
  category_id      INT NOT NULL REFERENCES categories(id),
  name             NVARCHAR(200) NOT NULL,
  brand            NVARCHAR(100) NULL,
  model            NVARCHAR(100) NULL,
  serial_no        NVARCHAR(100) NULL,
  specs            NVARCHAR(MAX) NULL,
  status           NVARCHAR(20)  NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available','borrowed','issued','repair','pending_disposal','scrapped')),
  location_id      INT NULL REFERENCES locations(id),
  holder_person_id INT NULL REFERENCES people(id),
  department_id    INT NULL REFERENCES departments(id),
  due_date         DATE NULL,
  purchase_date    DATE NULL,
  purchase_price   DECIMAL(14,2) NULL,
  po_number        NVARCHAR(100) NULL,
  invoice_number   NVARCHAR(100) NULL,
  vendor_id        INT NULL REFERENCES vendors(id),
  warranty_expiry  DATE NULL,
  received_date    DATE NULL,
  image_path       NVARCHAR(500) NULL,
  notes            NVARCHAR(MAX) NULL,
  created_at       DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at       DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at       DATETIME2(0) NULL
);

CREATE TABLE consumables (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  sku           NVARCHAR(64)  NOT NULL UNIQUE,
  category_id   INT NOT NULL REFERENCES categories(id),
  name          NVARCHAR(200) NOT NULL,
  unit          NVARCHAR(50)  NOT NULL DEFAULT N'ชิ้น',
  qty_on_hand   INT NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  reorder_point INT NOT NULL DEFAULT 0,
  location_id   INT NULL REFERENCES locations(id),
  unit_cost     DECIMAL(14,2) NULL,
  vendor_id     INT NULL REFERENCES vendors(id),
  notes         NVARCHAR(MAX) NULL,
  image_path    NVARCHAR(500) NULL,
  created_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at    DATETIME2(0) NULL
);

CREATE TABLE asset_transactions (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  asset_id      INT NOT NULL REFERENCES assets(id),
  action        NVARCHAR(30) NOT NULL,
  from_status   NVARCHAR(20) NULL,
  to_status     NVARCHAR(20) NULL,
  person_id     INT NULL REFERENCES people(id),
  department_id INT NULL REFERENCES departments(id),
  location_id   INT NULL REFERENCES locations(id),
  due_date      DATE NULL,
  note          NVARCHAR(MAX) NULL,
  evidence_path NVARCHAR(500) NULL,
  cost          DECIMAL(14,2) NULL,
  performed_by  INT NULL REFERENCES users(id),
  doc_id        INT NULL REFERENCES documents(id),
  created_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE stock_movements (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  consumable_id INT NOT NULL REFERENCES consumables(id),
  type          NVARCHAR(10) NOT NULL CHECK (type IN ('in','out','adjust')),
  qty           INT NOT NULL,
  balance_after INT NOT NULL,
  person_id     INT NULL REFERENCES people(id),
  department_id INT NULL REFERENCES departments(id),
  unit_cost     DECIMAL(14,2) NULL,
  received_date DATE NULL,
  note          NVARCHAR(MAX) NULL,
  performed_by  INT NULL REFERENCES users(id),
  doc_id        INT NULL REFERENCES documents(id),
  created_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE stock_counts (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  name        NVARCHAR(200) NOT NULL,
  location_id INT NULL REFERENCES locations(id),
  status      NVARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by  INT NULL REFERENCES users(id),
  created_at  DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  closed_at   DATETIME2(0) NULL
);

CREATE TABLE stock_count_scans (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  count_id   INT NOT NULL REFERENCES stock_counts(id),
  asset_id   INT NULL REFERENCES assets(id),
  raw_code   NVARCHAR(200) NOT NULL,
  scanned_by INT NULL REFERENCES users(id),
  scanned_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (count_id, raw_code)
);

CREATE TABLE pending_batches (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  file_name  NVARCHAR(260) NULL,
  note       NVARCHAR(MAX) NULL,
  created_by INT NULL REFERENCES users(id),
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE pending_receipts (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  batch_id   INT NOT NULL REFERENCES pending_batches(id),
  line_no    INT NULL,
  sku        NVARCHAR(64) NULL,
  name       NVARCHAR(300) NULL,
  qty        INT NULL CHECK (qty > 0),
  unit_cost  DECIMAL(14,2) NULL,
  status     NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','cancelled')),
  doc_id     INT NULL REFERENCES documents(id),
  created_by INT NULL REFERENCES users(id),
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  closed_by  INT NULL REFERENCES users(id),
  closed_at  DATETIME2(0) NULL
);

CREATE TABLE audit_logs (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  user_id     INT NULL,
  username    NVARCHAR(100) NULL,
  entity      NVARCHAR(50)  NOT NULL,
  entity_id   INT NULL,
  action      NVARCHAR(50)  NOT NULL,
  before_json NVARCHAR(MAX) NULL,
  after_json  NVARCHAR(MAX) NULL,
  ip          NVARCHAR(64)  NULL,
  created_at  DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE access_logs (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  user_id    INT NULL,
  username   NVARCHAR(100) NULL,
  event      NVARCHAR(30)  NOT NULL,
  ip         NVARCHAR(64)  NULL,
  user_agent NVARCHAR(500) NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

-- INDEXES

CREATE INDEX idx_access_created ON access_logs(created_at);
CREATE INDEX idx_assets_serial  ON assets(serial_no);
CREATE INDEX idx_assets_status  ON assets(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_atx_asset      ON asset_transactions(asset_id, created_at);
CREATE INDEX idx_atx_doc        ON asset_transactions(doc_id) WHERE doc_id IS NOT NULL;
CREATE INDEX idx_audit_created  ON audit_logs(created_at);
CREATE INDEX idx_audit_entity   ON audit_logs(entity, entity_id);
CREATE INDEX idx_docs_type      ON documents(type, doc_date);
CREATE INDEX idx_sm_cons        ON stock_movements(consumable_id, created_at);
CREATE INDEX idx_sm_doc         ON stock_movements(doc_id) WHERE doc_id IS NOT NULL;
CREATE INDEX idx_pending_status ON pending_receipts(status, batch_id);

-- REFERENCE DATA (permissions, system roles, default settings)

INSERT INTO permissions ([key], name, grp) VALUES
  ('dashboard.view',    N'ดู Dashboard', N'ทั่วไป'),
  ('asset.view',        N'ดูรายการอุปกรณ์', N'อุปกรณ์'),
  ('asset.create',      N'เพิ่มอุปกรณ์', N'อุปกรณ์'),
  ('asset.edit',        N'แก้ไขอุปกรณ์', N'อุปกรณ์'),
  ('asset.delete',      N'ลบอุปกรณ์ (soft delete)', N'อุปกรณ์'),
  ('asset.transact',    N'ยืม / คืน / เบิก / โอน / ส่งซ่อม', N'อุปกรณ์'),
  ('asset.scrap',       N'รอจำหน่าย / Scrap', N'อุปกรณ์'),
  ('consumable.view',   N'ดูวัสดุสิ้นเปลือง', N'วัสดุสิ้นเปลือง'),
  ('consumable.manage', N'เพิ่ม / แก้ไขวัสดุสิ้นเปลือง', N'วัสดุสิ้นเปลือง'),
  ('consumable.move',   N'รับเข้า / เบิก / ปรับยอด', N'วัสดุสิ้นเปลือง'),
  ('stockcount.manage', N'ตรวจนับ', N'วัสดุสิ้นเปลือง'),
  ('master.manage',     N'ข้อมูลหลัก (หมวด, สถานที่, แผนก, ผู้ขาย, พนักงาน)', N'ตั้งค่า'),
  ('data.import',       N'นำเข้า Excel', N'ตั้งค่า'),
  ('report.view',       N'ดูรายงาน', N'ทั่วไป'),
  ('report.export',     N'ส่งออก Excel', N'ตั้งค่า'),
  ('log.view',          N'ดู Access Log / Audit Trail', N'ความปลอดภัย'),
  ('user.manage',       N'จัดการผู้ใช้', N'ความปลอดภัย'),
  ('role.manage',       N'จัดการบทบาทและสิทธิ์', N'ความปลอดภัย'),
  ('settings.manage',   N'ตั้งค่าระบบ', N'ความปลอดภัย');

SET IDENTITY_INSERT roles ON;
INSERT INTO roles (id, [key], name, description, is_system) VALUES
  (1, 'admin',    N'Admin',    N'ทำได้ทุกอย่าง', 1),
  (2, 'it_staff', N'IT Staff', N'จัดการอุปกรณ์และวัสดุสิ้นเปลือง', 1),
  (3, 'viewer',   N'Viewer',   N'ดูข้อมูลอย่างเดียว', 1);
SET IDENTITY_INSERT roles OFF;

-- Admin: all permissions
INSERT INTO role_permissions (role_id, perm_key) SELECT 1, [key] FROM permissions;
-- IT Staff: all except user / role / settings
INSERT INTO role_permissions (role_id, perm_key)
  SELECT 2, [key] FROM permissions WHERE [key] NOT IN ('user.manage','role.manage','settings.manage');
-- Viewer: read-only
INSERT INTO role_permissions (role_id, perm_key) VALUES
  (3, 'dashboard.view'), (3, 'report.view'), (3, 'asset.view'), (3, 'consumable.view');

INSERT INTO settings ([key], value) VALUES
  ('max_failed_logins',    '5'),
  ('lockout_minutes',      '15'),
  ('session_idle_minutes', '30'),
  ('log_retention_days',   '730'),
  ('warranty_alert_days',  '30'),
  ('org_name',             N'IT Store');

COMMIT;
GO

-- TRIGGERS (append-only logs and history)

CREATE TRIGGER access_no_update ON access_logs INSTEAD OF UPDATE AS
BEGIN
  THROW 50001, 'access_logs is immutable', 1;
END;
GO

CREATE TRIGGER access_no_delete ON access_logs INSTEAD OF DELETE AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @days INT = COALESCE((SELECT TRY_CAST(value AS INT) FROM settings WHERE [key] = 'log_retention_days'), 3650);
  IF EXISTS (SELECT 1 FROM deleted WHERE created_at > DATEADD(DAY, -@days, SYSUTCDATETIME()))
    THROW 50002, 'access_logs is immutable', 1;
  DELETE a FROM access_logs a JOIN deleted d ON d.id = a.id;
END;
GO

CREATE TRIGGER audit_no_update ON audit_logs INSTEAD OF UPDATE AS
BEGIN
  THROW 50003, 'audit_logs is immutable', 1;
END;
GO

CREATE TRIGGER audit_no_delete ON audit_logs INSTEAD OF DELETE AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @days INT = COALESCE((SELECT TRY_CAST(value AS INT) FROM settings WHERE [key] = 'log_retention_days'), 3650);
  IF EXISTS (SELECT 1 FROM deleted WHERE created_at > DATEADD(DAY, -@days, SYSUTCDATETIME()))
    THROW 50004, 'audit_logs is immutable', 1;
  DELETE a FROM audit_logs a JOIN deleted d ON d.id = a.id;
END;
GO

CREATE TRIGGER atx_no_update ON asset_transactions INSTEAD OF UPDATE AS
BEGIN
  THROW 50005, 'asset history is immutable', 1;
END;
GO

CREATE TRIGGER atx_no_delete ON asset_transactions INSTEAD OF DELETE AS
BEGIN
  THROW 50006, 'asset history is immutable', 1;
END;
GO
