-- ============================================================
--  schema.sql  —  Lead Distribution System
--  PostgreSQL 14+
-- ============================================================

-- ── ENUMS ────────────────────────────────────────────────────

CREATE TYPE delivery_type_enum    AS ENUM ('fixed', 'per_km');
CREATE TYPE equipment_type_enum   AS ENUM ('motoblock', 'tractor');
CREATE TYPE service_type_enum     AS ENUM ('ogorod', 'celina');

CREATE TYPE lead_status_enum AS ENUM (
  'new',
  'assigned',
  'accepted',
  'rejected',
  'timeout',
  'completed',
  'canceled',
  'unassigned',
  'failed_contact'   -- accepted but no action within accepted_ttl
);

CREATE TYPE assignment_status_enum AS ENUM (
  'sent',
  'accepted',
  'rejected',
  'timeout'
);

-- ── CITIES ───────────────────────────────────────────────────

CREATE TABLE cities (
  id                    SERIAL          PRIMARY KEY,
  name                  VARCHAR(100)    NOT NULL,
  delivery_type         delivery_type_enum  NOT NULL DEFAULT 'fixed',
  delivery_price        NUMERIC(10, 2)  NOT NULL DEFAULT 0
                          CHECK (delivery_price >= 0),
  base_radius           NUMERIC(6, 2)   CHECK (base_radius > 0),
  -- removed current_worker_index: replaced by last_assigned_at ordering
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_cities_name ON cities (LOWER(name));

-- ── WORKERS ──────────────────────────────────────────────────

CREATE TABLE workers (
  id                    SERIAL              PRIMARY KEY,
  name                  VARCHAR(100)        NOT NULL,
  phone                 VARCHAR(20),
  telegram_chat_id      BIGINT              UNIQUE NOT NULL,
  city_id               INT                 NOT NULL
                          REFERENCES cities (id) ON DELETE RESTRICT,
  equipment_type        equipment_type_enum NOT NULL DEFAULT 'motoblock',
  is_active             BOOLEAN             NOT NULL DEFAULT TRUE,
  last_assigned_at      TIMESTAMPTZ,        -- NULL = never assigned (highest priority in queue)
  priority              INT                 NOT NULL DEFAULT 0
                          CHECK (priority >= 0),
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Used by assignmentService: pick next eligible worker
CREATE INDEX idx_workers_city_active ON workers (city_id, is_active)
  WHERE is_active = TRUE;

-- Used by timeoutService + telegramService
CREATE INDEX idx_workers_telegram ON workers (telegram_chat_id);

-- ── LEADS ────────────────────────────────────────────────────

CREATE TABLE leads (
  id                    SERIAL              PRIMARY KEY,
  name                  VARCHAR(100),
  phone_normalized      VARCHAR(15)         NOT NULL,  -- always +380XXXXXXXXX
  phone_raw             VARCHAR(30)         NOT NULL,
  service_type          service_type_enum   NOT NULL,
  area                  NUMERIC(5, 1)       NOT NULL
                          CHECK (area >= 0.5 AND area <= 50),
  total_price           NUMERIC(10, 2)      NOT NULL
                          CHECK (total_price >= 1000),
  city_id               INT                 NOT NULL
                          REFERENCES cities (id) ON DELETE RESTRICT,
  worker_id             INT
                          REFERENCES workers (id) ON DELETE SET NULL,
  status                lead_status_enum    NOT NULL DEFAULT 'new',
  last_sent_worker_id   INT
                          REFERENCES workers (id) ON DELETE SET NULL,
  out_of_city           BOOLEAN             NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Anti-spam: find duplicate by phone in last N minutes
CREATE INDEX idx_leads_phone_created ON leads (phone_normalized, created_at DESC);

-- Timeout cron: find assigned leads past their deadline
CREATE INDEX idx_leads_status_updated ON leads (status, updated_at)
  WHERE status IN ('assigned', 'accepted');

-- Admin dashboard: filter by city or worker
CREATE INDEX idx_leads_city ON leads (city_id);
CREATE INDEX idx_leads_worker ON leads (worker_id);

-- ── LEAD_ASSIGNMENTS ─────────────────────────────────────────

CREATE TABLE lead_assignments (
  id                    SERIAL                  PRIMARY KEY,
  lead_id               INT                     NOT NULL
                          REFERENCES leads (id) ON DELETE CASCADE,
  worker_id             INT                     NOT NULL
                          REFERENCES workers (id) ON DELETE CASCADE,
  status                assignment_status_enum  NOT NULL DEFAULT 'sent',
  created_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- Used to skip already-tried workers during reassignment
CREATE INDEX idx_la_lead ON lead_assignments (lead_id);

-- Prevent sending the same lead to the same worker twice
CREATE UNIQUE INDEX uq_la_lead_worker ON lead_assignments (lead_id, worker_id);

-- ── TRIGGER: auto-update leads.updated_at ────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
