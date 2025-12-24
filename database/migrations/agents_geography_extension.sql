-- agents_geography_extension.sql
-- ---------------------------------------------------------------------------
-- Purpose: Allow video-archiving agents/engineers to be scoped by division.
--          Run manually (in staging/production) before enabling division-based
--          IDs in the app. Review and adjust grants/index names as needed.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Add division reference (nullable for town-based agents)
ALTER TABLE public.agents
    ADD COLUMN division_id INTEGER NULL,
    ADD CONSTRAINT agents_division_id_fkey
        FOREIGN KEY (division_id) REFERENCES public.divisions(id);

CREATE INDEX IF NOT EXISTS idx_agents_division_id ON public.agents(division_id);

-- 2. (Optional) backfill division_id here if you already know the mapping.
--    Example:
-- UPDATE public.agents a
-- SET division_id = d.id
-- FROM public.divisions d
-- WHERE a.department = d.name; -- adjust the join logic for your data

COMMIT;

