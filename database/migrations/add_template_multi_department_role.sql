-- ============================================================================
-- Template Multi-Department and Multi-Role Support Migration
-- ============================================================================
-- This migration adds support for templates to be assigned to multiple
-- departments and/or multiple roles, in addition to the existing single
-- department/role assignment.
-- ============================================================================

-- 1. Create bridge table for template-department relationships
CREATE TABLE IF NOT EXISTS public.efiling_template_departments (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES efiling_templates(id) ON DELETE CASCADE,
    department_id INTEGER NOT NULL REFERENCES efiling_departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_template_department UNIQUE (template_id, department_id)
);

CREATE INDEX idx_template_departments_template ON public.efiling_template_departments(template_id);
CREATE INDEX idx_template_departments_department ON public.efiling_template_departments(department_id);

COMMENT ON TABLE public.efiling_template_departments IS 'Bridge table linking templates to multiple departments';

-- 2. Create bridge table for template-role relationships
CREATE TABLE IF NOT EXISTS public.efiling_template_roles (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES efiling_templates(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES efiling_roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_template_role UNIQUE (template_id, role_id)
);

CREATE INDEX idx_template_roles_template ON public.efiling_template_roles(template_id);
CREATE INDEX idx_template_roles_role ON public.efiling_template_roles(role_id);

COMMENT ON TABLE public.efiling_template_roles IS 'Bridge table linking templates to multiple roles';

-- 3. Migrate existing single department_id to bridge table
INSERT INTO public.efiling_template_departments (template_id, department_id)
SELECT id, department_id
FROM public.efiling_templates
WHERE department_id IS NOT NULL
ON CONFLICT (template_id, department_id) DO NOTHING;

-- 4. Migrate existing single role_id to bridge table
INSERT INTO public.efiling_template_roles (template_id, role_id)
SELECT id, role_id
FROM public.efiling_templates
WHERE role_id IS NOT NULL
ON CONFLICT (template_id, role_id) DO NOTHING;

-- 5. Create view for template filtering with multiple departments/roles
CREATE OR REPLACE VIEW v_efiling_templates_with_assignments AS
SELECT 
    t.id,
    t.name,
    t.template_type,
    t.title,
    t.subject,
    t.main_content,
    t.category_id,
    t.created_by,
    t.is_system_template,
    t.is_active,
    t.usage_count,
    t.last_used_at,
    t.created_at,
    t.updated_at,
    -- Single department/role (for backward compatibility)
    t.department_id as single_department_id,
    t.role_id as single_role_id,
    -- Multiple departments (as JSON array)
    COALESCE(
        json_agg(DISTINCT jsonb_build_object('id', td.department_id, 'name', d.name)) 
        FILTER (WHERE td.department_id IS NOT NULL),
        '[]'::json
    ) as departments,
    -- Multiple roles (as JSON array)
    COALESCE(
        json_agg(DISTINCT jsonb_build_object('id', tr.role_id, 'name', r.name, 'code', r.code)) 
        FILTER (WHERE tr.role_id IS NOT NULL),
        '[]'::json
    ) as roles
FROM public.efiling_templates t
LEFT JOIN public.efiling_template_departments td ON t.id = td.template_id
LEFT JOIN public.efiling_departments d ON td.department_id = d.id
LEFT JOIN public.efiling_template_roles tr ON t.id = tr.template_id
LEFT JOIN public.efiling_roles r ON tr.role_id = r.id
WHERE t.is_active = true
GROUP BY t.id;

COMMENT ON VIEW v_efiling_templates_with_assignments IS 'View showing templates with their multiple department and role assignments';

-- 6. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.efiling_template_departments TO root;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.efiling_template_roles TO root;
GRANT SELECT ON v_efiling_templates_with_assignments TO root;

-- ============================================================================
-- Migration Complete
-- ============================================================================

