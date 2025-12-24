-- Add company_name column to agents table for contractors
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) NULL;

COMMENT ON COLUMN public.agents.company_name IS 'Company name for contractors (role = 2)';

