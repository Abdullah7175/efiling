-- ============================================================================
-- Add CNIC Field to Users Table Migration
-- ============================================================================
-- This migration adds a CNIC (Computerized National Identity Card) field
-- to the users table. CNIC is required for all users in the efiling system.
-- Format: 13 digits with hyphens (e.g., 42101-8065450-1)
-- ============================================================================

-- 1. Add CNIC column to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS cnic VARCHAR(15) NULL;

-- 2. Add unique constraint on CNIC to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cnic ON public.users(cnic) WHERE cnic IS NOT NULL;

-- 3. Add comment for documentation
COMMENT ON COLUMN public.users.cnic IS 'Computerized National Identity Card number (13 digits with format: 42101-8065450-1)';

-- 4. Grant permissions (if needed)
-- Note: Permissions are already granted on the users table, so this is just for reference
-- GRANT SELECT, INSERT, UPDATE ON public.users TO root;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- After running this migration, you may want to:
-- 1. Update existing users with CNIC values if needed
-- 2. Make the field required by adding a NOT NULL constraint after backfilling data
-- ============================================================================

