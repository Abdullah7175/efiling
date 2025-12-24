-- Migration: Change sla_policy_id to sla_matrix_id in efiling_file_types
-- Purpose: Use efiling_sla_matrix instead of efiling_sla_policies for file types
-- Date: 2025-12-18

-- Rename column from sla_policy_id to sla_matrix_id
ALTER TABLE public.efiling_file_types
RENAME COLUMN sla_policy_id TO sla_matrix_id;

-- Update the foreign key constraint name (if it exists, drop and recreate)
-- First, drop the old constraint if it exists
ALTER TABLE public.efiling_file_types
DROP CONSTRAINT IF EXISTS efiling_file_types_sla_policy_id_fkey;

-- Add new foreign key constraint for sla_matrix_id
ALTER TABLE public.efiling_file_types
ADD CONSTRAINT efiling_file_types_sla_matrix_id_fkey
FOREIGN KEY (sla_matrix_id) REFERENCES public.efiling_sla_matrix(id) ON DELETE SET NULL;

-- Update index name if it exists
DROP INDEX IF EXISTS idx_efiling_file_types_sla_policy;
CREATE INDEX IF NOT EXISTS idx_efiling_file_types_sla_matrix 
ON public.efiling_file_types(sla_matrix_id);

-- Add comment
COMMENT ON COLUMN public.efiling_file_types.sla_matrix_id IS 'Reference to efiling_sla_matrix for SLA timing rules based on role routing';

