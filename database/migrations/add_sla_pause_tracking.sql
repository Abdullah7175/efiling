-- Migration: Add SLA Pause Tracking for CEO Review
-- Purpose: Pause SLA timer when file reaches CEO, resume when CEO forwards
-- Date: 2025-10-17

-- Add columns to efiling_file_workflows for SLA pause tracking
ALTER TABLE efiling_file_workflows 
ADD COLUMN IF NOT EXISTS sla_paused BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sla_paused_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS sla_accumulated_hours NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS sla_pause_count INTEGER DEFAULT 0;

-- Create index for paused SLAs
CREATE INDEX IF NOT EXISTS idx_efiling_file_workflows_sla_paused 
ON efiling_file_workflows(sla_paused) 
WHERE sla_paused = TRUE;

-- Create SLA pause history table
CREATE TABLE IF NOT EXISTS efiling_sla_pause_history (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES efiling_files(id) ON DELETE CASCADE,
    workflow_id INTEGER NOT NULL REFERENCES efiling_file_workflows(id) ON DELETE CASCADE,
    paused_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resumed_at TIMESTAMP,
    pause_reason VARCHAR(100) DEFAULT 'CEO_REVIEW',
    paused_by_user_id INTEGER REFERENCES efiling_users(id),
    paused_by_role_id INTEGER REFERENCES efiling_roles(id),
    paused_by_stage_id INTEGER REFERENCES efiling_workflow_stages(id),
    duration_hours NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for SLA pause history
CREATE INDEX IF NOT EXISTS idx_sla_pause_history_file 
ON efiling_sla_pause_history(file_id);

CREATE INDEX IF NOT EXISTS idx_sla_pause_history_workflow 
ON efiling_sla_pause_history(workflow_id);

CREATE INDEX IF NOT EXISTS idx_sla_pause_history_active 
ON efiling_sla_pause_history(workflow_id, resumed_at) 
WHERE resumed_at IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN efiling_file_workflows.sla_paused IS 'TRUE when SLA timer is paused (e.g., file with CEO)';
COMMENT ON COLUMN efiling_file_workflows.sla_paused_at IS 'Timestamp when SLA was paused';
COMMENT ON COLUMN efiling_file_workflows.sla_accumulated_hours IS 'Total hours accumulated before pause (excludes pause duration)';
COMMENT ON COLUMN efiling_file_workflows.sla_pause_count IS 'Number of times SLA has been paused for this workflow';

COMMENT ON TABLE efiling_sla_pause_history IS 'Tracks all SLA pause/resume events for audit trail';
COMMENT ON COLUMN efiling_sla_pause_history.pause_reason IS 'Reason for pause: CEO_REVIEW, EXTERNAL_DEPENDENCY, etc.';
COMMENT ON COLUMN efiling_sla_pause_history.duration_hours IS 'Duration of pause in hours (calculated when resumed)';

-- Update trigger for sla_pause_history updated_at
CREATE OR REPLACE FUNCTION update_sla_pause_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sla_pause_history_updated_at
BEFORE UPDATE ON efiling_sla_pause_history
FOR EACH ROW
EXECUTE FUNCTION update_sla_pause_history_updated_at();

-- Add view for easy SLA status checking
CREATE OR REPLACE VIEW efiling_file_sla_status AS
SELECT 
    f.id as file_id,
    f.file_number,
    wf.id as workflow_id,
    wf.sla_paused,
    wf.sla_paused_at,
    wf.sla_accumulated_hours,
    wf.sla_pause_count,
    wf.sla_deadline,
    wf.sla_breached,
    CASE 
        WHEN wf.sla_paused THEN 'PAUSED'
        WHEN wf.sla_deadline < NOW() AND wf.workflow_status = 'IN_PROGRESS' THEN 'BREACHED'
        WHEN wf.sla_deadline >= NOW() THEN 'ACTIVE'
        ELSE 'COMPLETED'
    END as sla_status,
    CASE
        WHEN wf.sla_paused THEN NULL
        WHEN wf.sla_deadline >= NOW() THEN 
            ROUND(EXTRACT(EPOCH FROM (wf.sla_deadline - NOW()))/3600.0, 2)
        ELSE 
            ROUND(EXTRACT(EPOCH FROM (NOW() - wf.sla_deadline))/3600.0, 2) * -1
    END as hours_remaining,
    ws.stage_name as current_stage_name,
    r.code as current_stage_role_code,
    r.name as current_stage_role_name
FROM efiling_files f
LEFT JOIN efiling_file_workflows wf ON wf.file_id = f.id
LEFT JOIN efiling_workflow_stages ws ON ws.id = wf.current_stage_id
LEFT JOIN efiling_roles r ON r.id = ws.role_id
WHERE wf.id IS NOT NULL;

COMMENT ON VIEW efiling_file_sla_status IS 'Real-time SLA status for all files in workflow';

-- Grant permissions
GRANT SELECT ON efiling_file_sla_status TO PUBLIC;

COMMIT;

