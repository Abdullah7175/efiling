-- ============================================================================
-- Complaint Types Multi-Division Support Migration
-- ============================================================================
-- This migration adds support for complaint types to be assigned to multiple
-- divisions, in addition to the existing single division assignment.
-- ============================================================================

-- 1. Create bridge table for complaint_type-division relationships
CREATE TABLE IF NOT EXISTS public.complaint_type_divisions (
    id SERIAL PRIMARY KEY,
    complaint_type_id INTEGER NOT NULL REFERENCES complaint_types(id) ON DELETE CASCADE,
    division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_complaint_type_division UNIQUE (complaint_type_id, division_id)
);

CREATE INDEX idx_complaint_type_divisions_complaint_type ON public.complaint_type_divisions(complaint_type_id);
CREATE INDEX idx_complaint_type_divisions_division ON public.complaint_type_divisions(division_id);

COMMENT ON TABLE public.complaint_type_divisions IS 'Bridge table linking complaint types to multiple divisions';

-- 2. Migrate existing single division_id to bridge table
INSERT INTO public.complaint_type_divisions (complaint_type_id, division_id)
SELECT id, division_id
FROM public.complaint_types
WHERE division_id IS NOT NULL
ON CONFLICT (complaint_type_id, division_id) DO NOTHING;

-- 3. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_type_divisions TO root;

-- ============================================================================
-- Migration Complete
-- ============================================================================

