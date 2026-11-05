# IT Store — Database schema

Exported from `data/it_storage.db` on 2026-10-20 (SQLite). DDL: [schema.sql](schema.sql).

| Table | Rows |
|---|---:|
| [access_logs](#access_logs) | 0 |
| [asset_transactions](#asset_transactions) | 0 |
| [assets](#assets) | 0 |
| [audit_logs](#audit_logs) | 0 |
| [categories](#categories) | 0 |
| [consumables](#consumables) | 0 |
| [departments](#departments) | 0 |
| [documents](#documents) | 0 |
| [locations](#locations) | 0 |
| [people](#people) | 0 |
| [permissions](#permissions) | 19 |
| [role_permissions](#role_permissions) | 39 |
| [roles](#roles) | 3 |
| [sessions](#sessions) | 0 |
| [settings](#settings) | 6 |
| [stock_count_scans](#stock_count_scans) | 0 |
| [stock_counts](#stock_counts) | 0 |
| [stock_movements](#stock_movements) | 0 |
| [users](#users) | 1 |
| [vendors](#vendors) | 0 |

## access_logs

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `user_id` | INTEGER | yes |  |  |
| `username` | TEXT | yes |  |  |
| `event` | TEXT | NO |  |  |
| `ip` | TEXT | yes |  |  |
| `user_agent` | TEXT | yes |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |

Indexes: `idx_access_created`

Triggers: `access_no_delete`, `access_no_update`

## asset_transactions

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `asset_id` | INTEGER | NO |  | FK → assets.id |
| `action` | TEXT | NO |  |  |
| `from_status` | TEXT | yes |  |  |
| `to_status` | TEXT | yes |  |  |
| `person_id` | INTEGER | yes |  | FK → people.id |
| `department_id` | INTEGER | yes |  | FK → departments.id |
| `location_id` | INTEGER | yes |  | FK → locations.id |
| `due_date` | TEXT | yes |  |  |
| `note` | TEXT | yes |  |  |
| `evidence_path` | TEXT | yes |  |  |
| `cost` | REAL | yes |  |  |
| `performed_by` | INTEGER | yes |  | FK → users.id |
| `doc_id` | INTEGER | yes |  | FK → documents.id |
| `created_at` | TEXT | NO | `datetime('now')` |  |

Indexes: `idx_atx_asset`, `idx_atx_doc`

Triggers: `atx_no_delete`, `atx_no_update`

## assets

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `asset_tag` | TEXT | NO |  | UNIQUE |
| `category_id` | INTEGER | NO |  | FK → categories.id |
| `name` | TEXT | NO |  |  |
| `brand` | TEXT | yes |  |  |
| `model` | TEXT | yes |  |  |
| `serial_no` | TEXT | yes |  |  |
| `specs` | TEXT | yes |  |  |
| `status` | TEXT | NO | `'available'` |  |
| `location_id` | INTEGER | yes |  | FK → locations.id |
| `holder_person_id` | INTEGER | yes |  | FK → people.id |
| `department_id` | INTEGER | yes |  | FK → departments.id |
| `due_date` | TEXT | yes |  |  |
| `purchase_date` | TEXT | yes |  |  |
| `purchase_price` | REAL | yes |  |  |
| `po_number` | TEXT | yes |  |  |
| `invoice_number` | TEXT | yes |  |  |
| `vendor_id` | INTEGER | yes |  | FK → vendors.id |
| `warranty_expiry` | TEXT | yes |  |  |
| `received_date` | TEXT | yes |  |  |
| `image_path` | TEXT | yes |  |  |
| `notes` | TEXT | yes |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `updated_at` | TEXT | NO | `datetime('now')` |  |
| `deleted_at` | TEXT | yes |  |  |

Indexes: `idx_assets_serial`, `idx_assets_status`

## audit_logs

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `user_id` | INTEGER | yes |  |  |
| `username` | TEXT | yes |  |  |
| `entity` | TEXT | NO |  |  |
| `entity_id` | INTEGER | yes |  |  |
| `action` | TEXT | NO |  |  |
| `before_json` | TEXT | yes |  |  |
| `after_json` | TEXT | yes |  |  |
| `ip` | TEXT | yes |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |

Indexes: `idx_audit_created`, `idx_audit_entity`

Triggers: `audit_no_delete`, `audit_no_update`

## categories

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `name` | TEXT | NO |  |  |
| `kind` | TEXT | NO |  |  |
| `prefix` | TEXT | NO |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `deleted_at` | TEXT | yes |  |  |

## consumables

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `sku` | TEXT | NO |  | UNIQUE |
| `category_id` | INTEGER | NO |  | FK → categories.id |
| `name` | TEXT | NO |  |  |
| `unit` | TEXT | NO | `'ชิ้น'` |  |
| `qty_on_hand` | INTEGER | NO | `0` |  |
| `reorder_point` | INTEGER | NO | `0` |  |
| `location_id` | INTEGER | yes |  | FK → locations.id |
| `unit_cost` | REAL | yes |  |  |
| `vendor_id` | INTEGER | yes |  | FK → vendors.id |
| `notes` | TEXT | yes |  |  |
| `image_path` | TEXT | yes |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `updated_at` | TEXT | NO | `datetime('now')` |  |
| `deleted_at` | TEXT | yes |  |  |

## departments

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `name` | TEXT | NO |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `deleted_at` | TEXT | yes |  |  |

## documents

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `doc_no` | TEXT | NO |  | UNIQUE |
| `type` | TEXT | NO |  |  |
| `doc_date` | TEXT | NO |  |  |
| `mode` | TEXT | yes |  |  |
| `person_id` | INTEGER | yes |  | FK → people.id |
| `department_id` | INTEGER | yes |  | FK → departments.id |
| `location_id` | INTEGER | yes |  | FK → locations.id |
| `vendor_id` | INTEGER | yes |  | FK → vendors.id |
| `po_number` | TEXT | yes |  |  |
| `invoice_number` | TEXT | yes |  |  |
| `due_date` | TEXT | yes |  |  |
| `note` | TEXT | yes |  |  |
| `created_by` | INTEGER | yes |  | FK → users.id |
| `created_at` | TEXT | NO | `datetime('now')` |  |

Indexes: `idx_docs_type`

## locations

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `name` | TEXT | NO |  |  |
| `branch` | TEXT | yes |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `deleted_at` | TEXT | yes |  |  |

## people

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `name` | TEXT | NO |  |  |
| `department_id` | INTEGER | yes |  | FK → departments.id |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `deleted_at` | TEXT | yes |  |  |

## permissions

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `key` | TEXT | NO |  | PK |
| `name` | TEXT | NO |  |  |
| `grp` | TEXT | NO |  |  |

## role_permissions

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `role_id` | INTEGER | NO |  | PK, FK → roles.id |
| `perm_key` | TEXT | NO |  | PK, FK → permissions.key |

## roles

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `key` | TEXT | NO |  | UNIQUE |
| `name` | TEXT | NO |  |  |
| `description` | TEXT | yes |  |  |
| `is_system` | INTEGER | NO | `0` |  |

## sessions

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | TEXT | NO |  | PK |
| `user_id` | INTEGER | NO |  | FK → users.id |
| `ip` | TEXT | yes |  |  |
| `user_agent` | TEXT | yes |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `last_seen` | TEXT | NO | `datetime('now')` |  |

## settings

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `key` | TEXT | NO |  | PK |
| `value` | TEXT | NO |  |  |

## stock_count_scans

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `count_id` | INTEGER | NO |  | FK → stock_counts.id |
| `asset_id` | INTEGER | yes |  | FK → assets.id |
| `raw_code` | TEXT | NO |  |  |
| `scanned_by` | INTEGER | yes |  | FK → users.id |
| `scanned_at` | TEXT | NO | `datetime('now')` |  |

## stock_counts

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `name` | TEXT | NO |  |  |
| `location_id` | INTEGER | yes |  | FK → locations.id |
| `status` | TEXT | NO | `'open'` |  |
| `created_by` | INTEGER | yes |  | FK → users.id |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `closed_at` | TEXT | yes |  |  |

## stock_movements

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `consumable_id` | INTEGER | NO |  | FK → consumables.id |
| `type` | TEXT | NO |  |  |
| `qty` | INTEGER | NO |  |  |
| `balance_after` | INTEGER | NO |  |  |
| `person_id` | INTEGER | yes |  | FK → people.id |
| `department_id` | INTEGER | yes |  | FK → departments.id |
| `unit_cost` | REAL | yes |  |  |
| `received_date` | TEXT | yes |  |  |
| `note` | TEXT | yes |  |  |
| `performed_by` | INTEGER | yes |  | FK → users.id |
| `doc_id` | INTEGER | yes |  | FK → documents.id |
| `created_at` | TEXT | NO | `datetime('now')` |  |

Indexes: `idx_sm_cons`, `idx_sm_doc`

## users

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `username` | TEXT | NO |  | UNIQUE |
| `password_hash` | TEXT | NO |  |  |
| `full_name` | TEXT | NO |  |  |
| `role_id` | INTEGER | NO |  | FK → roles.id |
| `is_active` | INTEGER | NO | `1` |  |
| `failed_attempts` | INTEGER | NO | `0` |  |
| `locked_until` | TEXT | yes |  |  |
| `last_login_at` | TEXT | yes |  |  |
| `password_changed_at` | TEXT | yes |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `deleted_at` | TEXT | yes |  |  |

## vendors

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | INTEGER | NO |  | PK |
| `name` | TEXT | NO |  |  |
| `contact` | TEXT | yes |  |  |
| `phone` | TEXT | yes |  |  |
| `email` | TEXT | yes |  |  |
| `created_at` | TEXT | NO | `datetime('now')` |  |
| `deleted_at` | TEXT | yes |  |  |

