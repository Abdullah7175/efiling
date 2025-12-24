-- =====================================================
-- Create v_efiling_users_by_location view
-- This view is required for e-filing user profile lookups
-- =====================================================

-- Drop the view if it exists (to allow recreation)
DROP VIEW IF EXISTS public.v_efiling_users_by_location;

-- Create the view
CREATE OR REPLACE VIEW public.v_efiling_users_by_location AS
SELECT 
  u.id AS efiling_user_id,
  u.user_id,
  u.efiling_role_id,
  r.code AS role_code,
  r.name AS role_name,
  u.district_id,
  d.title AS district_name,
  u.town_id,
  t.town AS town_name,
  u.subtown_id,
  st.subtown AS subtown_name,
  u.division_id,
  div.name AS division_name,
  div.ce_type AS division_type,
  dept.department_type,
  u.department_id,
  dept.name AS department_name,
  u.is_active
FROM efiling_users u
LEFT JOIN efiling_roles r ON u.efiling_role_id = r.id
LEFT JOIN district d ON u.district_id = d.id
LEFT JOIN town t ON u.town_id = t.id
LEFT JOIN subtown st ON u.subtown_id = st.id
LEFT JOIN divisions div ON u.division_id = div.id
LEFT JOIN efiling_departments dept ON u.department_id = dept.id
WHERE u.is_active = true;

-- Add comment
COMMENT ON VIEW public.v_efiling_users_by_location IS 'View showing all active e-filing users with their geographic assignments for routing purposes';

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT ON public.v_efiling_users_by_location TO your_app_user;

