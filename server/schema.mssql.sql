-- SQL Server schema (DB_CLIENT=mssql). Same tables as schema.sql; run by db.js on every start, so each
-- object is created only when missing. Batches are separated by GO lines. Timestamps are UTC.

IF OBJECT_ID(N'dbo.settings', N'U') IS NULL
CREATE TABLE settings (
  "key" NVARCHAR(64)   PRIMARY KEY,
  value NVARCHAR(1000) NOT NULL
);

IF OBJECT_ID(N'dbo.permissions', N'U') IS NULL
CREATE TABLE permissions (
  "key" NVARCHAR(64)  PRIMARY KEY,
  name  NVARCHAR(200) NOT NULL,
  grp   NVARCHAR(100) NOT NULL
);

IF OBJECT_ID(N'dbo.roles', N'U') IS NULL
CREATE TABLE roles (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  "key"       NVARCHAR(64)  NOT NULL UNIQUE,
  name        NVARCHAR(200) NOT NULL,
  description NVARCHAR(500) NULL,
  is_system   BIT NOT NULL DEFAULT 0
);

IF OBJECT_ID(N'dbo.role_permissions', N'U') IS NULL
CREATE TABLE role_permissions (
  role_id  INT          NOT NULL REFERENCES roles(id),
  perm_key NVARCHAR(64) NOT NULL REFERENCES permissions("key"),
  PRIMARY KEY (role_id, perm_key)
);

IF OBJECT_ID(N'dbo.departments', N'U') IS NULL
CREATE TABLE departments (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(200) NOT NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at DATETIME2(0) NULL
);

IF OBJECT_ID(N'dbo.locations', N'U') IS NULL
CREATE TABLE locations (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(200) NOT NULL,
  branch     NVARCHAR(200) NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at DATETIME2(0) NULL
);

IF OBJECT_ID(N'dbo.categories', N'U') IS NULL
CREATE TABLE categories (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(200) NOT NULL,
  kind       NVARCHAR(20)  NOT NULL CHECK (kind IN ('asset','consumable')),
  prefix     NVARCHAR(20)  NOT NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at DATETIME2(0) NULL
);

IF OBJECT_ID(N'dbo.vendors', N'U') IS NULL
CREATE TABLE vendors (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(200) NOT NULL,
  contact    NVARCHAR(200) NULL,
  phone      NVARCHAR(50)  NULL,
  email      NVARCHAR(200) NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at DATETIME2(0) NULL
);

IF OBJECT_ID(N'dbo.people', N'U') IS NULL
CREATE TABLE people (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  name          NVARCHAR(200) NOT NULL,
  department_id INT NULL REFERENCES departments(id),
  created_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at    DATETIME2(0) NULL
);

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
CREATE TABLE users (
  id                  INT IDENTITY(1,1) PRIMARY KEY,
  username            NVARCHAR(100) NOT NULL UNIQUE,
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

IF OBJECT_ID(N'dbo.sessions', N'U') IS NULL
CREATE TABLE sessions (
  id         NVARCHAR(128) PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  ip         NVARCHAR(64)  NULL,
  user_agent NVARCHAR(500) NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  last_seen  DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'dbo.documents', N'U') IS NULL
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

IF OBJECT_ID(N'dbo.assets', N'U') IS NULL
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

IF OBJECT_ID(N'dbo.consumables', N'U') IS NULL
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

IF OBJECT_ID(N'dbo.asset_transactions', N'U') IS NULL
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

IF OBJECT_ID(N'dbo.stock_movements', N'U') IS NULL
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

IF OBJECT_ID(N'dbo.stock_counts', N'U') IS NULL
CREATE TABLE stock_counts (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  name        NVARCHAR(200) NOT NULL,
  location_id INT NULL REFERENCES locations(id),
  status      NVARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by  INT NULL REFERENCES users(id),
  created_at  DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  closed_at   DATETIME2(0) NULL
);

IF OBJECT_ID(N'dbo.stock_count_scans', N'U') IS NULL
CREATE TABLE stock_count_scans (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  count_id   INT NOT NULL REFERENCES stock_counts(id),
  asset_id   INT NULL REFERENCES assets(id),
  raw_code   NVARCHAR(200) NOT NULL,
  scanned_by INT NULL REFERENCES users(id),
  scanned_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  UNIQUE (count_id, raw_code)
);

IF OBJECT_ID(N'dbo.pending_batches', N'U') IS NULL
CREATE TABLE pending_batches (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  file_name  NVARCHAR(260) NULL,
  note       NVARCHAR(MAX) NULL,
  created_by INT NULL REFERENCES users(id),
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'dbo.pending_receipts', N'U') IS NULL
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
  closed_at  DATETIME2(0) NULL,
  deleted_at DATETIME2(0) NULL
);

IF OBJECT_ID(N'dbo.orders', N'U') IS NULL
CREATE TABLE orders (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  order_no      NVARCHAR(30) NOT NULL UNIQUE,
  status        NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','delivered','rejected','cancelled')),
  person_id     INT NULL REFERENCES people(id),
  department_id INT NULL REFERENCES departments(id),
  note          NVARCHAR(MAX) NULL,
  requested_by  INT NOT NULL REFERENCES users(id),
  created_at    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  reviewed_by   INT NULL REFERENCES users(id),
  reviewed_at   DATETIME2(0) NULL,
  review_note   NVARCHAR(MAX) NULL,
  received_by   INT NULL REFERENCES users(id),
  received_at   DATETIME2(0) NULL,
  receive_doc_id INT NULL REFERENCES documents(id),
  delivered_by  INT NULL REFERENCES users(id),
  delivered_at  DATETIME2(0) NULL,
  doc_id        INT NULL REFERENCES documents(id),
  cancelled_at  DATETIME2(0) NULL
);

IF OBJECT_ID(N'dbo.order_lines', N'U') IS NULL
CREATE TABLE order_lines (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id),
  kind          NVARCHAR(20) NOT NULL CHECK (kind IN ('asset','consumable')),
  consumable_id INT NULL REFERENCES consumables(id),
  category_id   INT NULL REFERENCES categories(id),
  name          NVARCHAR(300) NOT NULL,
  brand         NVARCHAR(200) NOT NULL DEFAULT '',
  model         NVARCHAR(200) NOT NULL DEFAULT '',
  qty           INT NOT NULL CHECK (qty > 0),
  approved_qty  INT NULL CHECK (approved_qty >= 0),
  unit_price    DECIMAL(14,2) NULL
);

IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL
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

IF OBJECT_ID(N'dbo.access_logs', N'U') IS NULL
CREATE TABLE access_logs (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  user_id    INT NULL,
  username   NVARCHAR(100) NULL,
  event      NVARCHAR(30)  NOT NULL,
  ip         NVARCHAR(64)  NULL,
  user_agent NVARCHAR(500) NULL,
  created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_access_created') CREATE INDEX idx_access_created ON access_logs(created_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_assets_serial')  CREATE INDEX idx_assets_serial  ON assets(serial_no);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_assets_status')  CREATE INDEX idx_assets_status  ON assets(status) WHERE deleted_at IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_atx_asset')      CREATE INDEX idx_atx_asset      ON asset_transactions(asset_id, created_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_atx_doc')        CREATE INDEX idx_atx_doc        ON asset_transactions(doc_id) WHERE doc_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_audit_created')  CREATE INDEX idx_audit_created  ON audit_logs(created_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_audit_entity')   CREATE INDEX idx_audit_entity   ON audit_logs(entity, entity_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_docs_type')      CREATE INDEX idx_docs_type      ON documents(type, doc_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_sm_cons')        CREATE INDEX idx_sm_cons        ON stock_movements(consumable_id, created_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_sm_doc')         CREATE INDEX idx_sm_doc         ON stock_movements(doc_id) WHERE doc_id IS NOT NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.pending_receipts') AND name = N'qty' AND is_nullable = 0)
BEGIN
  DECLARE @ck NVARCHAR(256), @drop NVARCHAR(400);
  SELECT @ck = cc.name FROM sys.check_constraints cc
    JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
    WHERE cc.parent_object_id = OBJECT_ID(N'dbo.pending_receipts') AND c.name = N'qty';
  SET @drop = N'ALTER TABLE pending_receipts DROP CONSTRAINT ' + QUOTENAME(@ck);
  IF @ck IS NOT NULL EXEC sp_executesql @drop;
  ALTER TABLE pending_receipts ALTER COLUMN qty INT NULL;
  ALTER TABLE pending_receipts ADD CHECK (qty > 0);
  ALTER TABLE pending_receipts ALTER COLUMN sku NVARCHAR(64) NULL;
END
GO

IF COL_LENGTH(N'dbo.pending_receipts', N'deleted_at') IS NULL ALTER TABLE pending_receipts ADD deleted_at DATETIME2(0) NULL;
IF COL_LENGTH(N'dbo.orders', N'received_by') IS NULL ALTER TABLE orders ADD received_by INT NULL REFERENCES users(id);
IF COL_LENGTH(N'dbo.orders', N'received_at') IS NULL ALTER TABLE orders ADD received_at DATETIME2(0) NULL;
IF COL_LENGTH(N'dbo.orders', N'receive_doc_id') IS NULL ALTER TABLE orders ADD receive_doc_id INT NULL REFERENCES documents(id);
IF COL_LENGTH(N'dbo.order_lines', N'unit_price') IS NULL ALTER TABLE order_lines ADD unit_price DECIMAL(14,2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_pending_status') CREATE INDEX idx_pending_status ON pending_receipts(status, batch_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_orders_status') CREATE INDEX idx_orders_status ON orders(status, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_orders_user') CREATE INDEX idx_orders_user ON orders(requested_by, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_order_lines') CREATE INDEX idx_order_lines ON order_lines(order_id);
GO

-- Append-only logs and history (deleting log rows is allowed only past settings.log_retention_days).
CREATE OR ALTER TRIGGER access_no_update ON access_logs INSTEAD OF UPDATE AS
BEGIN
  THROW 50001, 'access_logs is immutable', 1;
END;
GO

CREATE OR ALTER TRIGGER access_no_delete ON access_logs INSTEAD OF DELETE AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @days INT = COALESCE((SELECT TRY_CAST(value AS INT) FROM settings WHERE "key" = 'log_retention_days'), 3650);
  IF EXISTS (SELECT 1 FROM deleted WHERE created_at > DATEADD(DAY, -@days, SYSUTCDATETIME()))
    THROW 50002, 'access_logs is immutable', 1;
  DELETE a FROM access_logs a JOIN deleted d ON d.id = a.id;
END;
GO

CREATE OR ALTER TRIGGER audit_no_update ON audit_logs INSTEAD OF UPDATE AS
BEGIN
  THROW 50003, 'audit_logs is immutable', 1;
END;
GO

CREATE OR ALTER TRIGGER audit_no_delete ON audit_logs INSTEAD OF DELETE AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @days INT = COALESCE((SELECT TRY_CAST(value AS INT) FROM settings WHERE "key" = 'log_retention_days'), 3650);
  IF EXISTS (SELECT 1 FROM deleted WHERE created_at > DATEADD(DAY, -@days, SYSUTCDATETIME()))
    THROW 50004, 'audit_logs is immutable', 1;
  DELETE a FROM audit_logs a JOIN deleted d ON d.id = a.id;
END;
GO

CREATE OR ALTER TRIGGER atx_no_update ON asset_transactions INSTEAD OF UPDATE AS
BEGIN
  THROW 50005, 'asset history is immutable', 1;
END;
GO

CREATE OR ALTER TRIGGER atx_no_delete ON asset_transactions INSTEAD OF DELETE AS
BEGIN
  THROW 50006, 'asset history is immutable', 1;
END;
GO
