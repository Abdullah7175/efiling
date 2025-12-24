-- ============================================================================
-- Add Department ID to SLA Policies Migration
-- ============================================================================
-- This migration adds department_id to efiling_sla_policies table
-- to allow filtering SLA policies by department when creating file types.
-- ============================================================================

-- 1. Add department_id column to efiling_sla_policies table
ALTER TABLE public.efiling_sla_policies
ADD COLUMN IF NOT EXISTS department_id INTEGER NULL;

-- 2. Add foreign key constraint
ALTER TABLE public.efiling_sla_policies
ADD CONSTRAINT efiling_sla_policies_department_id_fkey 
FOREIGN KEY (department_id) REFERENCES public.efiling_departments(id) ON DELETE SET NULL;

-- 3. Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_efiling_sla_policies_department 
ON public.efiling_sla_policies(department_id);

-- 4. Add comment for documentation
COMMENT ON COLUMN public.efiling_sla_policies.department_id IS 
'Department ID for department-specific SLA policies. NULL means the policy is global and applies to all departments.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- After running this migration:
-- 1. Existing SLA policies will have NULL department_id (global policies)
-- 2. New policies can be created with or without department_id
-- 3. API will filter policies by department_id when provided
-- ============================================================================

