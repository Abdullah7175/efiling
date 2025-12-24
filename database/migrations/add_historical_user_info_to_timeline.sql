-- Migration: Add historical user information columns to timeline tables
-- This ensures that timeline shows the user's name, designation, and location
-- as they were at the time of the action, not current values

-- Add historical columns to efiling_file_movements
ALTER TABLE public.efiling_file_movements
ADD COLUMN IF NOT EXISTS from_user_name VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS from_user_designation VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS from_user_town_id INT4 NULL,
ADD COLUMN IF NOT EXISTS from_user_division_id INT4 NULL,
ADD COLUMN IF NOT EXISTS to_user_name VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS to_user_designation VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS to_user_town_id INT4 NULL,
ADD COLUMN IF NOT EXISTS to_user_division_id INT4 NULL;

-- Add foreign key constraints for town and division
ALTER TABLE public.efiling_file_movements
ADD CONSTRAINT efiling_file_movements_from_user_town_id_fkey 
FOREIGN KEY (from_user_town_id) REFERENCES public.town(id);

ALTER TABLE public.efiling_file_movements
ADD CONSTRAINT efiling_file_movements_from_user_division_id_fkey 
FOREIGN KEY (from_user_division_id) REFERENCES public.divisions(id);

ALTER TABLE public.efiling_file_movements
ADD CONSTRAINT efiling_file_movements_to_user_town_id_fkey 
FOREIGN KEY (to_user_town_id) REFERENCES public.town(id);

ALTER TABLE public.efiling_file_movements
ADD CONSTRAINT efiling_file_movements_to_user_division_id_fkey 
FOREIGN KEY (to_user_division_id) REFERENCES public.divisions(id);

-- Add historical columns to efiling_document_signatures
ALTER TABLE public.efiling_document_signatures
ADD COLUMN IF NOT EXISTS user_designation VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS user_town_id INT4 NULL,
ADD COLUMN IF NOT EXISTS user_division_id INT4 NULL;

-- Add foreign key constraints for town and division
ALTER TABLE public.efiling_document_signatures
ADD CONSTRAINT efiling_document_signatures_user_town_id_fkey 
FOREIGN KEY (user_town_id) REFERENCES public.town(id);

ALTER TABLE public.efiling_document_signatures
ADD CONSTRAINT efiling_document_signatures_user_division_id_fkey 
FOREIGN KEY (user_division_id) REFERENCES public.divisions(id);

-- Add comments
COMMENT ON COLUMN public.efiling_file_movements.from_user_name IS 'Historical name of the user who marked the file (at time of action)';
COMMENT ON COLUMN public.efiling_file_movements.from_user_designation IS 'Historical designation of the user who marked the file (at time of action)';
COMMENT ON COLUMN public.efiling_file_movements.from_user_town_id IS 'Historical town assignment of the user who marked the file (at time of action)';
COMMENT ON COLUMN public.efiling_file_movements.from_user_division_id IS 'Historical division assignment of the user who marked the file (at time of action)';
COMMENT ON COLUMN public.efiling_file_movements.to_user_name IS 'Historical name of the user the file was marked to (at time of action)';
COMMENT ON COLUMN public.efiling_file_movements.to_user_designation IS 'Historical designation of the user the file was marked to (at time of action)';
COMMENT ON COLUMN public.efiling_file_movements.to_user_town_id IS 'Historical town assignment of the user the file was marked to (at time of action)';
COMMENT ON COLUMN public.efiling_file_movements.to_user_division_id IS 'Historical division assignment of the user the file was marked to (at time of action)';

COMMENT ON COLUMN public.efiling_document_signatures.user_designation IS 'Historical designation of the user who signed (at time of signature)';
COMMENT ON COLUMN public.efiling_document_signatures.user_town_id IS 'Historical town assignment of the user who signed (at time of signature)';
COMMENT ON COLUMN public.efiling_document_signatures.user_division_id IS 'Historical division assignment of the user who signed (at time of signature)';

