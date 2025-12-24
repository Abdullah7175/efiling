-- Add color and text fields to efiling_user_signatures table
-- This migration adds support for signature colors (black, blue, red) and typed signature text/font

-- Add signature_color column
ALTER TABLE public.efiling_user_signatures
ADD COLUMN IF NOT EXISTS signature_color VARCHAR(20) DEFAULT 'black' CHECK (signature_color IN ('black', 'blue', 'red'));

-- Add signature_text column for typed signatures
ALTER TABLE public.efiling_user_signatures
ADD COLUMN IF NOT EXISTS signature_text TEXT NULL;

-- Add signature_font column for typed signatures
ALTER TABLE public.efiling_user_signatures
ADD COLUMN IF NOT EXISTS signature_font VARCHAR(100) DEFAULT 'Arial';

-- Create index on signature_color for faster queries
CREATE INDEX IF NOT EXISTS idx_efiling_user_signatures_color ON public.efiling_user_signatures(signature_color);

-- Update existing signatures to have default black color
UPDATE public.efiling_user_signatures
SET signature_color = 'black'
WHERE signature_color IS NULL;

COMMENT ON COLUMN public.efiling_user_signatures.signature_color IS 'Color of the signature: black, blue, or red';
COMMENT ON COLUMN public.efiling_user_signatures.signature_text IS 'Text content for typed signatures';
COMMENT ON COLUMN public.efiling_user_signatures.signature_font IS 'Font family for typed signatures';

