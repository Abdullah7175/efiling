-- ============================================
-- TEAM-BASED WORKFLOW SYSTEM - MIGRATION SCRIPT
-- Run this script to add team-based workflow functionality
-- ============================================

-- 1. Create efiling_user_teams table
CREATE TABLE IF NOT EXISTS public.efiling_user_teams (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER NOT NULL REFERENCES efiling_users(id) ON DELETE CASCADE,
    team_member_id INTEGER NOT NULL REFERENCES efiling_users(id) ON DELETE CASCADE,
    team_role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_team_member UNIQUE (manager_id, team_member_id),
    CONSTRAINT check_not_self_reference CHECK (manager_id != team_member_id)
);

CREATE INDEX idx_team_manager ON efiling_user_teams(manager_id);
CREATE INDEX idx_team_member ON efiling_user_teams(team_member_id);
CREATE INDEX idx_team_active ON efiling_user_teams(manager_id, is_active) WHERE is_active = true;

COMMENT ON TABLE efiling_user_teams IS 'Links team members (assistants) to their managers (EE/SE/CE)';
COMMENT ON COLUMN efiling_user_teams.team_role IS 'Role in team: DAO, AEE, SUB_ENGINEER, AO, ASSISTANT, SE_ASSISTANT';

-- 2. Create efiling_file_workflow_states table
CREATE TABLE IF NOT EXISTS public.efiling_file_workflow_states (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES efiling_files(id) ON DELETE CASCADE,
    current_state VARCHAR(50) NOT NULL DEFAULT 'TEAM_INTERNAL',
    current_assigned_to INTEGER REFERENCES efiling_users(id),
    creator_id INTEGER NOT NULL REFERENCES efiling_users(id),
    is_within_team BOOLEAN DEFAULT true,
    tat_started BOOLEAN DEFAULT false,
    tat_started_at TIMESTAMP NULL,
    last_external_mark_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_file_state UNIQUE (file_id),
    CONSTRAINT check_state_values CHECK (current_state IN ('TEAM_INTERNAL', 'EXTERNAL', 'RETURNED_TO_CREATOR'))
);

CREATE INDEX idx_workflow_state_file ON efiling_file_workflow_states(file_id);
CREATE INDEX idx_workflow_state_assigned ON efiling_file_workflow_states(current_assigned_to);
CREATE INDEX idx_workflow_state_creator ON efiling_file_workflow_states(creator_id);
CREATE INDEX idx_workflow_state_type ON efiling_file_workflow_states(current_state);
CREATE INDEX idx_workflow_state_team ON efiling_file_workflow_states(is_within_team) WHERE is_within_team = true;

COMMENT ON TABLE efiling_file_workflow_states IS 'Tracks file workflow state (internal team vs external)';
COMMENT ON COLUMN efiling_file_workflow_states.current_state IS 'TEAM_INTERNAL, EXTERNAL, or RETURNED_TO_CREATOR';
COMMENT ON COLUMN efiling_file_workflow_states.is_within_team IS 'True if file is within creator team workflow';
COMMENT ON COLUMN efiling_file_workflow_states.tat_started IS 'True if TAT timer has started';

-- 3. Create efiling_file_page_additions table
CREATE TABLE IF NOT EXISTS public.efiling_file_page_additions (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES efiling_files(id) ON DELETE CASCADE,
    page_id INTEGER NOT NULL REFERENCES efiling_document_pages(id) ON DELETE CASCADE,
    added_by INTEGER NOT NULL REFERENCES efiling_users(id),
    added_by_role_code VARCHAR(50),
    addition_type VARCHAR(50) DEFAULT 'CE_PAGE', -- SE_PAGE, CE_PAGE, SE_ASSISTANT_PAGE, CE_ASSISTANT_PAGE
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT NULL
);

CREATE INDEX idx_page_additions_file ON efiling_file_page_additions(file_id);
CREATE INDEX idx_page_additions_user ON efiling_file_page_additions(added_by);
CREATE INDEX idx_page_additions_type ON efiling_file_page_additions(addition_type);

COMMENT ON TABLE efiling_file_page_additions IS 'Tracks pages added by CE/Assistant for timeline';
COMMENT ON COLUMN efiling_file_page_additions.addition_type IS 'SE_PAGE, CE_PAGE, SE_ASSISTANT_PAGE, or CE_ASSISTANT_PAGE';

-- 4. Add workflow_state_id to efiling_files
ALTER TABLE efiling_files
ADD COLUMN IF NOT EXISTS workflow_state_id INTEGER REFERENCES efiling_file_workflow_states(id);

CREATE INDEX IF NOT EXISTS idx_efiling_files_workflow_state ON efiling_files(workflow_state_id);

-- 5. Create efiling_file_movements table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.efiling_file_movements (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES efiling_files(id) ON DELETE CASCADE,
    from_user_id INTEGER REFERENCES efiling_users(id),
    to_user_id INTEGER REFERENCES efiling_users(id),
    from_department_id INTEGER REFERENCES efiling_departments(id),
    to_department_id INTEGER REFERENCES efiling_departments(id),
    action_type VARCHAR(50) NOT NULL DEFAULT 'MARK_TO',
    remarks TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_team_internal BOOLEAN DEFAULT false,
    is_return_to_creator BOOLEAN DEFAULT false,
    tat_started BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_movements_file ON efiling_file_movements(file_id);
CREATE INDEX IF NOT EXISTS idx_movements_from_user ON efiling_file_movements(from_user_id);
CREATE INDEX IF NOT EXISTS idx_movements_to_user ON efiling_file_movements(to_user_id);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON efiling_file_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_movements_team_internal ON efiling_file_movements(is_team_internal) WHERE is_team_internal = true;
CREATE INDEX IF NOT EXISTS idx_movements_return_to_creator ON efiling_file_movements(is_return_to_creator) WHERE is_return_to_creator = true;
CREATE INDEX IF NOT EXISTS idx_movements_tat_started ON efiling_file_movements(tat_started) WHERE tat_started = true;

COMMENT ON TABLE efiling_file_movements IS 'Tracks all file movements/markings between users';
COMMENT ON COLUMN efiling_file_movements.is_team_internal IS 'True if movement is within creator team workflow';
COMMENT ON COLUMN efiling_file_movements.is_return_to_creator IS 'True if file is being returned to creator';
COMMENT ON COLUMN efiling_file_movements.tat_started IS 'True if TAT timer started with this movement';

-- 6. Create trigger function for updating workflow states
CREATE OR REPLACE FUNCTION update_workflow_state_on_movement()
RETURNS TRIGGER AS $$
BEGIN
    -- Update workflow state when file is moved
    UPDATE efiling_file_workflow_states
    SET 
        current_assigned_to = NEW.to_user_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE file_id = NEW.file_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger for file movements
DROP TRIGGER IF EXISTS trigger_update_workflow_state ON efiling_file_movements;
CREATE TRIGGER trigger_update_workflow_state
AFTER INSERT ON efiling_file_movements
FOR EACH ROW
EXECUTE FUNCTION update_workflow_state_on_movement();

-- 8. Create function to initialize workflow state for existing files
CREATE OR REPLACE FUNCTION initialize_existing_file_states()
RETURNS void AS $$
DECLARE
    file_record RECORD;
    state_id INTEGER;
    creator_id_val INTEGER;
BEGIN
    FOR file_record IN 
        SELECT id, created_by, assigned_to 
        FROM efiling_files 
        WHERE workflow_state_id IS NULL
    LOOP
        -- Skip files without creator or assigned_to
        IF file_record.created_by IS NULL AND file_record.assigned_to IS NULL THEN
            CONTINUE;
        END IF;
        
        -- Use created_by if available, otherwise use assigned_to as creator
        creator_id_val := COALESCE(file_record.created_by, file_record.assigned_to);
        
        INSERT INTO efiling_file_workflow_states (
            file_id, 
            creator_id, 
            current_assigned_to,
            current_state,
            is_within_team,
            tat_started
        ) VALUES (
            file_record.id,
            creator_id_val,
            COALESCE(file_record.assigned_to, creator_id_val),
            'TEAM_INTERNAL',
            true,
            false
        )
        ON CONFLICT (file_id) DO NOTHING
        RETURNING id INTO state_id;
        
        IF state_id IS NOT NULL THEN
            UPDATE efiling_files
            SET workflow_state_id = state_id
            WHERE id = file_record.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run initialization for existing files
SELECT initialize_existing_file_states();

-- 9. Create view for team hierarchy
CREATE OR REPLACE VIEW v_efiling_team_hierarchy AS
SELECT 
    t.id,
    t.manager_id,
    m.id as manager_efiling_id,
    u_m.name as manager_name,
    u_m.email as manager_email,
    m.efiling_role_id as manager_role_id,
    mr.code as manager_role_code,
    mr.name as manager_role_name,
    t.team_member_id,
    tm.id as team_member_efiling_id,
    u_tm.name as team_member_name,
    u_tm.email as team_member_email,
    tm.efiling_role_id as team_member_role_id,
    tmr.code as team_member_role_code,
    tmr.name as team_member_role_name,
    t.team_role,
    t.is_active,
    t.created_at,
    t.updated_at
FROM efiling_user_teams t
JOIN efiling_users m ON t.manager_id = m.id
JOIN efiling_users tm ON t.team_member_id = tm.id
JOIN users u_m ON m.user_id = u_m.id
JOIN users u_tm ON tm.user_id = u_tm.id
LEFT JOIN efiling_roles mr ON m.efiling_role_id = mr.id
LEFT JOIN efiling_roles tmr ON tm.efiling_role_id = tmr.id
WHERE t.is_active = true;

COMMENT ON VIEW v_efiling_team_hierarchy IS 'View showing team hierarchy with manager and team member details';

-- 10. Create function to get team members for a manager
CREATE OR REPLACE FUNCTION get_team_members(p_manager_id INTEGER)
RETURNS TABLE (
    team_member_id INTEGER,
    team_member_name VARCHAR,
    team_role VARCHAR,
    role_code VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.team_member_id,
        u.name,
        t.team_role,
        r.code
    FROM efiling_user_teams t
    JOIN efiling_users eu ON t.team_member_id = eu.id
    JOIN users u ON eu.user_id = u.id
    LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
    WHERE t.manager_id = p_manager_id 
    AND t.is_active = true
    AND eu.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- 11. Create function to check if user is team member of manager
CREATE OR REPLACE FUNCTION is_team_member(p_manager_id INTEGER, p_user_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM efiling_user_teams 
        WHERE manager_id = p_manager_id 
        AND team_member_id = p_user_id 
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql;

-- 12. Create function to get manager for a team member
CREATE OR REPLACE FUNCTION get_manager_for_user(p_user_id INTEGER)
RETURNS TABLE (
    manager_id INTEGER,
    manager_name VARCHAR,
    manager_role_code VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.manager_id,
        u.name,
        r.code
    FROM efiling_user_teams t
    JOIN efiling_users eu ON t.manager_id = eu.id
    JOIN users u ON eu.user_id = u.id
    LEFT JOIN efiling_roles r ON eu.efiling_role_id = r.id
    WHERE t.team_member_id = p_user_id 
    AND t.is_active = true
    AND eu.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 13. Grant permissions
GRANT ALL ON TABLE efiling_user_teams TO root;
GRANT ALL ON TABLE efiling_file_workflow_states TO root;
GRANT ALL ON TABLE efiling_file_page_additions TO root;
GRANT SELECT ON VIEW v_efiling_team_hierarchy TO root;
GRANT EXECUTE ON FUNCTION get_team_members(INTEGER) TO root;
GRANT EXECUTE ON FUNCTION is_team_member(INTEGER, INTEGER) TO root;
GRANT EXECUTE ON FUNCTION get_manager_for_user(INTEGER) TO root;

-- 14. Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_team_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_team_updated_at
BEFORE UPDATE ON efiling_user_teams
FOR EACH ROW
EXECUTE FUNCTION update_team_updated_at();

CREATE TRIGGER trigger_update_workflow_state_updated_at
BEFORE UPDATE ON efiling_file_workflow_states
FOR EACH ROW
EXECUTE FUNCTION update_team_updated_at();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

