-- ============================================================================
-- E-Filing Templates System Migration
-- ============================================================================
-- This migration extends the efiling_templates table to support:
-- 1. Role-based and department-based template filtering
-- 2. Template types (notesheet, letter, memo, etc.)
-- 3. Template structure (title, subject, main_content)
-- 4. User-created templates with auto-populated department/role
-- 5. Admin-only deletion
-- ============================================================================

-- 1. Alter efiling_templates table to add new columns
ALTER TABLE public.efiling_templates
ADD COLUMN IF NOT EXISTS template_type VARCHAR(50) NULL, -- Type: notesheet(I), notesheet(II), letter, memo, etc.
ADD COLUMN IF NOT EXISTS title VARCHAR(500) NULL, -- Template title (e.g., "NOTESHEET")
ADD COLUMN IF NOT EXISTS subject TEXT NULL, -- Template subject line
ADD COLUMN IF NOT EXISTS main_content TEXT NULL, -- Main document content (replaces template_content)
ADD COLUMN IF NOT EXISTS department_id INTEGER NULL REFERENCES efiling_departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS role_id INTEGER NULL REFERENCES efiling_roles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_system_template BOOLEAN DEFAULT false NULL, -- True for admin-created templates, false for user-created
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0 NULL, -- Track how many times template has been used
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP NULL; -- Last time template was used

-- 2. Migrate existing template_content to main_content if needed
UPDATE public.efiling_templates
SET main_content = template_content
WHERE main_content IS NULL AND template_content IS NOT NULL;

-- 3. Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_efiling_templates_department ON public.efiling_templates(department_id);
CREATE INDEX IF NOT EXISTS idx_efiling_templates_role ON public.efiling_templates(role_id);
CREATE INDEX IF NOT EXISTS idx_efiling_templates_type ON public.efiling_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_efiling_templates_active ON public.efiling_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_efiling_templates_created_by ON public.efiling_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_efiling_templates_department_role ON public.efiling_templates(department_id, role_id);

-- 4. Add comments
COMMENT ON COLUMN public.efiling_templates.template_type IS 'Type of template: notesheet(I), notesheet(II), letter, memo, etc.';
COMMENT ON COLUMN public.efiling_templates.title IS 'Template title that will populate the title field';
COMMENT ON COLUMN public.efiling_templates.subject IS 'Template subject that will populate the subject field';
COMMENT ON COLUMN public.efiling_templates.main_content IS 'Main document content that will populate the main content field';
COMMENT ON COLUMN public.efiling_templates.department_id IS 'Department this template belongs to (NULL = all departments)';
COMMENT ON COLUMN public.efiling_templates.role_id IS 'Role this template is for (NULL = all roles in department)';
COMMENT ON COLUMN public.efiling_templates.is_system_template IS 'True for admin-created templates, false for user-created templates';
COMMENT ON COLUMN public.efiling_templates.usage_count IS 'Number of times this template has been used';
COMMENT ON COLUMN public.efiling_templates.last_used_at IS 'Last time this template was used';

-- 5. Create function to increment template usage
CREATE OR REPLACE FUNCTION increment_template_usage(p_template_id INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE public.efiling_templates
    SET usage_count = COALESCE(usage_count, 0) + 1,
        last_used_at = CURRENT_TIMESTAMP
    WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_template_usage IS 'Increments usage count and updates last_used_at when a template is used';

-- 6. Create view for template filtering (department + role)
CREATE OR REPLACE VIEW v_efiling_templates_filtered AS
SELECT 
    t.id,
    t.name,
    t.template_type,
    t.title,
    t.subject,
    t.main_content,
    t.category_id,
    t.department_id,
    d.name as department_name,
    t.role_id,
    r.name as role_name,
    r.code as role_code,
    t.created_by,
    u.name as created_by_name,
    t.is_system_template,
    t.is_active,
    t.usage_count,
    t.last_used_at,
    t.created_at,
    t.updated_at
FROM public.efiling_templates t
LEFT JOIN public.efiling_departments d ON t.department_id = d.id
LEFT JOIN public.efiling_roles r ON t.role_id = r.id
LEFT JOIN public.efiling_users eu ON t.created_by = eu.id
LEFT JOIN public.users u ON eu.user_id = u.id
WHERE t.is_active = true;

COMMENT ON VIEW v_efiling_templates_filtered IS 'Filtered view of active templates with department and role information';

-- 7. Add constraint to ensure template has either title, subject, or main_content
ALTER TABLE public.efiling_templates
ADD CONSTRAINT check_template_content CHECK (
    (title IS NOT NULL AND title != '') OR
    (subject IS NOT NULL AND subject != '') OR
    (main_content IS NOT NULL AND main_content != '')
);

-- 8. Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_efiling_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_efiling_templates_updated_at ON public.efiling_templates;
CREATE TRIGGER trigger_update_efiling_templates_updated_at
BEFORE UPDATE ON public.efiling_templates
FOR EACH ROW
EXECUTE FUNCTION update_efiling_templates_updated_at();

-- 9. Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.efiling_templates TO root;
GRANT SELECT ON v_efiling_templates_filtered TO root;

-- ============================================================================
-- Migration Complete
-- ============================================================================

