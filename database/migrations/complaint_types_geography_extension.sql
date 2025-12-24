-- Add efiling_department_id and division_id to complaint_types table
-- This allows departments to be linked to e-filing departments and divisions

ALTER TABLE public.complaint_types
    ADD COLUMN IF NOT EXISTS efiling_department_id INTEGER NULL,
    ADD COLUMN IF NOT EXISTS division_id INTEGER NULL;

-- Add foreign key constraints
ALTER TABLE public.complaint_types
    ADD CONSTRAINT complaint_types_efiling_department_id_fkey
        FOREIGN KEY (efiling_department_id) REFERENCES public.efiling_departments(id)
        ON DELETE SET NULL,
    ADD CONSTRAINT complaint_types_division_id_fkey
        FOREIGN KEY (division_id) REFERENCES public.divisions(id)
        ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_complaint_types_efiling_department_id 
    ON public.complaint_types(efiling_department_id);
CREATE INDEX IF NOT EXISTS idx_complaint_types_division_id 
    ON public.complaint_types(division_id);

-- Add comments for documentation
COMMENT ON COLUMN public.complaint_types.efiling_department_id IS 
    'Optional link to e-filing department for integration with e-filing system';
COMMENT ON COLUMN public.complaint_types.division_id IS 
    'Optional link to division. If set, this department is division-based rather than town-based';

