-- Run once on existing DBs (PostgreSQL 14+). Fails if values already exist — that is OK.
-- New installs: use schema.sql (enum already lists all service types).

ALTER TYPE service_type_enum ADD VALUE 'mowing';
ALTER TYPE service_type_enum ADD VALUE 'tree';
ALTER TYPE service_type_enum ADD VALUE 'washing';
