-- ============================================================================
-- CE User Geographic Assignments Migration
-- ============================================================================
-- This migration adds support for CE users to be assigned to zones, divisions,
-- districts, and towns, allowing them to see and approve only requests within
-- their geographic scope.
-- ============================================================================

-- 1. Create bridge tables for CE user geographic assignments
CREATE TABLE IF NOT EXISTS public.ce_user_zones (
    id SERIAL PRIMARY KEY,
    ce_user_id INTEGER NOT NULL REFERENCES ce_users(id) ON DELETE CASCADE,
    zone_id INTEGER NOT NULL REFERENCES efiling_zones(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_ce_user_zone UNIQUE (ce_user_id, zone_id)
);

CREATE TABLE IF NOT EXISTS public.ce_user_divisions (
    id SERIAL PRIMARY KEY,
    ce_user_id INTEGER NOT NULL REFERENCES ce_users(id) ON DELETE CASCADE,
    division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_ce_user_division UNIQUE (ce_user_id, division_id)
);

CREATE TABLE IF NOT EXISTS public.ce_user_districts (
    id SERIAL PRIMARY KEY,
    ce_user_id INTEGER NOT NULL REFERENCES ce_users(id) ON DELETE CASCADE,
    district_id INTEGER NOT NULL REFERENCES district(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_ce_user_district UNIQUE (ce_user_id, district_id)
);

CREATE TABLE IF NOT EXISTS public.ce_user_towns (
    id SERIAL PRIMARY KEY,
    ce_user_id INTEGER NOT NULL REFERENCES ce_users(id) ON DELETE CASCADE,
    town_id INTEGER NOT NULL REFERENCES town(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_ce_user_town UNIQUE (ce_user_id, town_id)
);

-- 2. Create indexes for better query performance
CREATE INDEX idx_ce_user_zones_ce_user ON public.ce_user_zones(ce_user_id);
CREATE INDEX idx_ce_user_zones_zone ON public.ce_user_zones(zone_id);

CREATE INDEX idx_ce_user_divisions_ce_user ON public.ce_user_divisions(ce_user_id);
CREATE INDEX idx_ce_user_divisions_division ON public.ce_user_divisions(division_id);

CREATE INDEX idx_ce_user_districts_ce_user ON public.ce_user_districts(ce_user_id);
CREATE INDEX idx_ce_user_districts_district ON public.ce_user_districts(district_id);

CREATE INDEX idx_ce_user_towns_ce_user ON public.ce_user_towns(ce_user_id);
CREATE INDEX idx_ce_user_towns_town ON public.ce_user_towns(town_id);

-- 3. Add comments for documentation
COMMENT ON TABLE public.ce_user_zones IS 'Bridge table linking CE users to zones';
COMMENT ON TABLE public.ce_user_divisions IS 'Bridge table linking CE users to divisions';
COMMENT ON TABLE public.ce_user_districts IS 'Bridge table linking CE users to districts';
COMMENT ON TABLE public.ce_user_towns IS 'Bridge table linking CE users to towns';

-- 4. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_user_zones TO root;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_user_divisions TO root;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_user_districts TO root;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_user_towns TO root;

-- ============================================================================
-- Migration Complete
-- ============================================================================

