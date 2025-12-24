-- ============================================================================
-- E-Filing Database Cleanup Script
-- ============================================================================
-- This script cleans up the E-Filing database by removing video archiving tables
-- and updating foreign key constraints.
--
-- IMPORTANT: 
-- 1. This script assumes you've already created the 'efiling' database copy
-- 2. Backup your database before running this script
-- 3. Run this during a maintenance window
-- 4. Test in a development environment first
-- 5. Verify data integrity after cleanup
-- ============================================================================

-- ============================================================================
-- PART 1: CONNECT TO EFILING DATABASE
-- ============================================================================

\c efiling

-- ============================================================================
-- PART 2: DROP VIDEO ARCHIVING TABLES
-- ============================================================================
-- Drop all Video Archiving specific tables
-- Note: CASCADE will automatically drop dependent objects (indexes, constraints, triggers, etc.)

-- Core video archiving tables
DROP TABLE IF EXISTS public.work_requests CASCADE;
DROP TABLE IF EXISTS public.work_request_approvals CASCADE;
DROP TABLE IF EXISTS public.work_request_locations CASCADE;
DROP TABLE IF EXISTS public.work_request_soft_approvals CASCADE;
DROP TABLE IF EXISTS public.work_request_subtowns CASCADE;
DROP TABLE IF EXISTS public.videos CASCADE;
DROP TABLE IF EXISTS public.images CASCADE;
DROP TABLE IF EXISTS public.before_content CASCADE;
DROP TABLE IF EXISTS public.final_videos CASCADE;
DROP TABLE IF EXISTS public.request_assign_smagent CASCADE;
DROP TABLE IF EXISTS public.request_assign_agent CASCADE;
DROP TABLE IF EXISTS public.work CASCADE;
DROP TABLE IF EXISTS public.main CASCADE;

-- Drop sequences if they exist (from video archiving tables)
DROP SEQUENCE IF EXISTS public.before_images_id_seq CASCADE;

-- ============================================================================
-- PART 3: UPDATE EFILING_FILES TABLE
-- ============================================================================

-- Remove FK constraint from efiling_files.work_request_id
-- (work_request_id will be external reference, validated via API)
ALTER TABLE public.efiling_files 
    DROP CONSTRAINT IF EXISTS efiling_files_work_request_id_fkey;

-- Add comment to document the change
COMMENT ON COLUMN public.efiling_files.work_request_id IS 
    'External reference to work_request in video_archiving database. Validated via API call to Video Archiving system (http://localhost:3000/api/external/work-requests/verify).';

-- ============================================================================
-- PART 4: VERIFY DIVISIONS AND ZONES TABLES
-- ============================================================================
-- These tables should remain in E-Filing database (they are managed by E-Filing)

-- Verify divisions table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'divisions'
    ) THEN
        RAISE EXCEPTION 'divisions table not found!';
    END IF;
END $$;

-- Verify efiling_zones table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'efiling_zones'
    ) THEN
        RAISE EXCEPTION 'efiling_zones table not found!';
    END IF;
END $$;

-- Verify divisions.department_id FK constraint exists (should be kept)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND constraint_name = 'divisions_department_id_fkey'
    ) THEN
        RAISE WARNING 'divisions.department_id FK constraint not found - this may be expected if it was already removed';
    END IF;
END $$;

-- ============================================================================
-- PART 5: VERIFICATION QUERIES
-- ============================================================================

-- List all remaining tables in efiling database
SELECT 'E-Filing Database - Remaining Tables' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check for any remaining video archiving tables (should be empty)
SELECT 'Remaining video archiving tables (should be empty)' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'work_requests', 'videos', 'images', 'before_content', 
    'final_videos', 'work_request_approvals', 'work_request_locations',
    'work_request_soft_approvals', 'work_request_subtowns',
    'request_assign_agent', 'request_assign_smagent', 'work', 'main'
  )
ORDER BY table_name;

-- Check efiling core tables exist
SELECT 'E-Filing Core Tables' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'efiling_%'
ORDER BY table_name;

-- Verify divisions and efiling_zones exist
SELECT 'Divisions and Zones in E-Filing Database' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('divisions', 'efiling_zones')
ORDER BY table_name;

-- Check efiling_files table structure
SELECT 'E-Filing Files Table - work_request_id Column' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'efiling_files'
  AND column_name = 'work_request_id';

-- Check for FK constraints on efiling_files.work_request_id (should be none)
SELECT 'E-Filing Files - Foreign Key Constraints on work_request_id' as info;
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'efiling_files'
    AND kcu.column_name = 'work_request_id';

-- ============================================================================
-- PART 6: DATA INTEGRITY CHECKS
-- ============================================================================

-- Count records in efiling tables
SELECT 'E-Filing - Record Counts' as info;
SELECT 'efiling_files' as table_name, COUNT(*) as row_count FROM public.efiling_files
UNION ALL
SELECT 'efiling_users', COUNT(*) FROM public.efiling_users
UNION ALL
SELECT 'efiling_departments', COUNT(*) FROM public.efiling_departments
UNION ALL
SELECT 'efiling_roles', COUNT(*) FROM public.efiling_roles
UNION ALL
SELECT 'divisions', COUNT(*) FROM public.divisions
UNION ALL
SELECT 'efiling_zones', COUNT(*) FROM public.efiling_zones
ORDER BY table_name;

-- Check efiling_files with work_request_id (external references)
SELECT 'E-Filing files with work_request_id (external references)' as info;
SELECT 
    COUNT(*) as total_files,
    COUNT(CASE WHEN work_request_id IS NOT NULL THEN 1 END) as with_work_request,
    COUNT(CASE WHEN work_request_id IS NULL THEN 1 END) as without_work_request
FROM public.efiling_files;

-- Check divisions table structure
SELECT 'Divisions Table Structure' as info;
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'divisions'
ORDER BY ordinal_position;

-- Check efiling_zones table structure
SELECT 'E-Filing Zones Table Structure' as info;
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'efiling_zones'
ORDER BY ordinal_position;

-- ============================================================================
-- PART 7: CREATE API ACCESS VIEWS (Optional)
-- ============================================================================
-- These views can be used for read-only API access if needed

-- View for divisions (read-only, for API access)
CREATE OR REPLACE VIEW public.api_divisions AS
SELECT 
    id,
    name,
    code,
    ce_type,
    department_id,
    description,
    is_active,
    created_at,
    updated_at
FROM public.divisions
WHERE is_active = true;

-- View for zones (read-only, for API access)
CREATE OR REPLACE VIEW public.api_zones AS
SELECT 
    id,
    name,
    ce_type,
    description,
    is_active,
    created_at,
    updated_at
FROM public.efiling_zones
WHERE is_active = true;

-- Grant read-only access to API user (if using database user for API)
-- GRANT SELECT ON public.api_divisions TO api_user;
-- GRANT SELECT ON public.api_zones TO api_user;

-- ============================================================================
-- END OF SCRIPT
-- ============================================================================
-- 
-- NEXT STEPS:
-- 1. Verify all data migrated correctly
-- 2. Create API endpoints in E-Filing for divisions and zones
-- 3. Update application code to use external APIs for work-requests
-- 4. Test E-Filing system independently
-- 5. Deploy E-Filing on port 5000 (intranet)
-- 
-- ============================================================================

