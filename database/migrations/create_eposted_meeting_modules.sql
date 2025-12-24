-- =============================================================================
-- E-POSTED & MEETING SCHEDULER MODULES - DATABASE MIGRATION
-- =============================================================================
-- Purpose: Create database tables for E-Posted (Daak System) and Meeting Scheduler
-- Date: 2025-12-04
-- Total Tables: 11 (5 for E-Posted, 6 for Meeting Scheduler)
-- =============================================================================

BEGIN;

-- =============================================================================
-- MODULE 1: E-POSTED (DAAK SYSTEM)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. efiling_daak_categories - Predefined categories for daak
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_daak_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(100), -- Icon name for UI (e.g., 'promotion', 'transfer', 'notice')
    color VARCHAR(20), -- Hex color code (e.g., '#FF5733')
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT efiling_daak_categories_code_key UNIQUE (code)
);

CREATE INDEX idx_daak_categories_active ON public.efiling_daak_categories(is_active) WHERE is_active = true;
CREATE INDEX idx_daak_categories_code ON public.efiling_daak_categories(code);

COMMENT ON TABLE public.efiling_daak_categories IS 'Predefined categories for organizing daak (Promotion, Transfer, Notice, Announcement, etc.)';
COMMENT ON COLUMN public.efiling_daak_categories.code IS 'Unique code for category (e.g., PROMOTION, TRANSFER, NOTICE)';

-- -----------------------------------------------------------------------------
-- 2. efiling_daak - Main daak/letter table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_daak (
    id SERIAL PRIMARY KEY,
    daak_number VARCHAR(100) UNIQUE NOT NULL, -- Auto-generated unique number
    subject VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category_id INTEGER REFERENCES public.efiling_daak_categories(id),
    priority VARCHAR(20) DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    created_by INTEGER NOT NULL REFERENCES public.efiling_users(id) ON DELETE RESTRICT,
    department_id INTEGER REFERENCES public.efiling_departments(id),
    role_id INTEGER REFERENCES public.efiling_roles(id),
    is_urgent BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT false, -- If true, visible to all users even if not recipient
    expires_at TIMESTAMP, -- Optional expiration date
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'CANCELLED')),
    sent_at TIMESTAMP,
    total_recipients INTEGER DEFAULT 0, -- Cached count
    acknowledged_count INTEGER DEFAULT 0, -- Cached count
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_daak_created_by ON public.efiling_daak(created_by);
CREATE INDEX idx_daak_category ON public.efiling_daak(category_id);
CREATE INDEX idx_daak_status ON public.efiling_daak(status);
CREATE INDEX idx_daak_priority ON public.efiling_daak(priority);
CREATE INDEX idx_daak_created_at ON public.efiling_daak(created_at DESC);
CREATE INDEX idx_daak_public ON public.efiling_daak(is_public) WHERE is_public = true;
CREATE INDEX idx_daak_expires ON public.efiling_daak(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE public.efiling_daak IS 'Main table for daak/letters/notifications sent by higher authorities';
COMMENT ON COLUMN public.efiling_daak.daak_number IS 'Unique auto-generated daak number (e.g., DAAK-2025-001)';
COMMENT ON COLUMN public.efiling_daak.is_public IS 'If true, all users can view this daak even if not in recipients list';
COMMENT ON COLUMN public.efiling_daak.status IS 'DRAFT: Not sent yet, SENT: Sent to recipients, CANCELLED: Cancelled before sending';

-- -----------------------------------------------------------------------------
-- 3. efiling_daak_recipients - Who receives the daak
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_daak_recipients (
    id SERIAL PRIMARY KEY,
    daak_id INTEGER NOT NULL REFERENCES public.efiling_daak(id) ON DELETE CASCADE,
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('USER', 'ROLE', 'ROLE_GROUP', 'TEAM', 'DEPARTMENT', 'EVERYONE')),
    recipient_id INTEGER, -- user_id, role_id, role_group_id, team_id, department_id, or NULL for EVERYONE
    efiling_user_id INTEGER REFERENCES public.efiling_users(id) ON DELETE CASCADE, -- Resolved user ID (for USER type or expanded from role/group/team)
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'RECEIVED', 'ACKNOWLEDGED')),
    received_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_daak_user_recipient UNIQUE (daak_id, efiling_user_id)
);

CREATE INDEX idx_daak_recipients_daak ON public.efiling_daak_recipients(daak_id);
CREATE INDEX idx_daak_recipients_user ON public.efiling_daak_recipients(efiling_user_id);
CREATE INDEX idx_daak_recipients_type ON public.efiling_daak_recipients(recipient_type, recipient_id);
CREATE INDEX idx_daak_recipients_status ON public.efiling_daak_recipients(status);
CREATE INDEX idx_daak_recipients_acknowledged ON public.efiling_daak_recipients(daak_id, acknowledged_at) WHERE acknowledged_at IS NOT NULL;

COMMENT ON TABLE public.efiling_daak_recipients IS 'Recipients of daak - can be individual users or expanded from roles/groups/teams/departments';
COMMENT ON COLUMN public.efiling_daak_recipients.recipient_type IS 'Type of recipient: USER, ROLE, ROLE_GROUP, TEAM, DEPARTMENT, or EVERYONE';
COMMENT ON COLUMN public.efiling_daak_recipients.efiling_user_id IS 'Resolved user ID - for USER type directly, for others expanded from role/group/team';

-- -----------------------------------------------------------------------------
-- 4. efiling_daak_acknowledgments - Acknowledgments from recipients
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_daak_acknowledgments (
    id SERIAL PRIMARY KEY,
    daak_id INTEGER NOT NULL REFERENCES public.efiling_daak(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES public.efiling_users(id) ON DELETE CASCADE,
    acknowledgment_text TEXT, -- Optional comment from recipient
    acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45), -- IPv4 or IPv6
    user_agent TEXT, -- Browser/client information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_daak_user_acknowledgment UNIQUE (daak_id, recipient_id)
);

CREATE INDEX idx_daak_ack_daak ON public.efiling_daak_acknowledgments(daak_id);
CREATE INDEX idx_daak_ack_user ON public.efiling_daak_acknowledgments(recipient_id);
CREATE INDEX idx_daak_ack_date ON public.efiling_daak_acknowledgments(acknowledged_at DESC);

COMMENT ON TABLE public.efiling_daak_acknowledgments IS 'Acknowledgments from recipients confirming they received the daak';
COMMENT ON COLUMN public.efiling_daak_acknowledgments.acknowledgment_text IS 'Optional comment from recipient when acknowledging';

-- -----------------------------------------------------------------------------
-- 5. efiling_daak_attachments - File attachments for daak
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_daak_attachments (
    id SERIAL PRIMARY KEY,
    daak_id INTEGER NOT NULL REFERENCES public.efiling_daak(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size BIGINT, -- Size in bytes
    file_type VARCHAR(100), -- MIME type
    uploaded_by INTEGER NOT NULL REFERENCES public.efiling_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_daak_attachments_daak ON public.efiling_daak_attachments(daak_id);
CREATE INDEX idx_daak_attachments_uploaded_by ON public.efiling_daak_attachments(uploaded_by);

COMMENT ON TABLE public.efiling_daak_attachments IS 'File attachments associated with daak';

-- =============================================================================
-- MODULE 2: MEETING SCHEDULER
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6. efiling_meeting_settings - System settings for meetings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_meeting_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL, -- Store settings as JSON
    description TEXT,
    updated_by INTEGER REFERENCES public.efiling_users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT efiling_meeting_settings_key_key UNIQUE (setting_key)
);

CREATE INDEX idx_meeting_settings_key ON public.efiling_meeting_settings(setting_key);

COMMENT ON TABLE public.efiling_meeting_settings IS 'System settings for meeting scheduler (SMTP config, default reminders, timezone, etc.)';
COMMENT ON COLUMN public.efiling_meeting_settings.setting_value IS 'JSON object containing setting values (e.g., {"smtp_host": "...", "smtp_port": 587})';

-- -----------------------------------------------------------------------------
-- 7. efiling_meetings - Main meeting table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_meetings (
    id SERIAL PRIMARY KEY,
    meeting_number VARCHAR(100) UNIQUE NOT NULL, -- Auto-generated unique number
    title VARCHAR(500) NOT NULL,
    description TEXT,
    agenda TEXT, -- Meeting agenda items
    meeting_type VARCHAR(20) DEFAULT 'IN_PERSON' CHECK (meeting_type IN ('IN_PERSON', 'VIRTUAL', 'HYBRID')),
    meeting_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER, -- Calculated duration
    venue_address VARCHAR(500), -- Physical venue/address for in-person or hybrid meetings
    meeting_link VARCHAR(1000), -- Virtual meeting link (Google Meet, Zoom, or any platform) for virtual or hybrid meetings
    organizer_id INTEGER NOT NULL REFERENCES public.efiling_users(id) ON DELETE RESTRICT,
    department_id INTEGER REFERENCES public.efiling_departments(id),
    status VARCHAR(20) DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'POSTPONED')),
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern JSONB, -- JSON for recurrence (e.g., {"frequency": "WEEKLY", "interval": 1, "days": ["MONDAY"]})
    reminder_sent BOOLEAN DEFAULT false,
    reminder_sent_at TIMESTAMP,
    total_attendees INTEGER DEFAULT 0, -- Cached count (internal + external)
    accepted_count INTEGER DEFAULT 0, -- Cached count
    present_count INTEGER DEFAULT 0, -- Cached count
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP
);

CREATE INDEX idx_meetings_organizer ON public.efiling_meetings(organizer_id);
CREATE INDEX idx_meetings_date ON public.efiling_meetings(meeting_date, start_time);
CREATE INDEX idx_meetings_status ON public.efiling_meetings(status);
CREATE INDEX idx_meetings_type ON public.efiling_meetings(meeting_type);
CREATE INDEX idx_meetings_recurring ON public.efiling_meetings(is_recurring) WHERE is_recurring = true;
CREATE INDEX idx_meetings_created_at ON public.efiling_meetings(created_at DESC);

COMMENT ON TABLE public.efiling_meetings IS 'Main table for scheduled meetings - all users can create meetings';
COMMENT ON COLUMN public.efiling_meetings.meeting_number IS 'Unique auto-generated meeting number (e.g., MEET-2025-001)';
COMMENT ON COLUMN public.efiling_meetings.venue_address IS 'Physical venue/address where meeting is organized (for IN_PERSON or HYBRID meetings)';
COMMENT ON COLUMN public.efiling_meetings.meeting_link IS 'Virtual meeting link - Google Meet, Zoom, or any virtual meeting platform URL (for VIRTUAL or HYBRID meetings)';
COMMENT ON COLUMN public.efiling_meetings.organizer_id IS 'User who created the meeting - all users can create meetings (no role restrictions)';
COMMENT ON COLUMN public.efiling_meetings.recurrence_pattern IS 'JSON object for recurring meetings (frequency, interval, days, end_date, etc.)';

-- -----------------------------------------------------------------------------
-- 8. efiling_meeting_attendees - Internal attendees (efiling_users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_meeting_attendees (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES public.efiling_meetings(id) ON DELETE CASCADE,
    attendee_id INTEGER NOT NULL REFERENCES public.efiling_users(id) ON DELETE CASCADE,
    attendee_type VARCHAR(20) DEFAULT 'USER' CHECK (attendee_type IN ('USER', 'ROLE', 'ROLE_GROUP', 'TEAM')),
    source_id INTEGER, -- If invited via role/group/team, store the source ID
    response_status VARCHAR(20) DEFAULT 'PENDING' CHECK (response_status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE')),
    attendance_status VARCHAR(20) CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'LATE', 'LEFT_EARLY')),
    responded_at TIMESTAMP,
    attended_at TIMESTAMP,
    left_at TIMESTAMP,
    notes TEXT, -- Optional notes from attendee
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_meeting_user_attendee UNIQUE (meeting_id, attendee_id)
);

CREATE INDEX idx_meeting_attendees_meeting ON public.efiling_meeting_attendees(meeting_id);
CREATE INDEX idx_meeting_attendees_user ON public.efiling_meeting_attendees(attendee_id);
CREATE INDEX idx_meeting_attendees_response ON public.efiling_meeting_attendees(response_status);
CREATE INDEX idx_meeting_attendees_attendance ON public.efiling_meeting_attendees(attendance_status);
CREATE INDEX idx_meeting_attendees_type ON public.efiling_meeting_attendees(attendee_type, source_id);

COMMENT ON TABLE public.efiling_meeting_attendees IS 'Internal attendees (efiling_users) invited to meetings';
COMMENT ON COLUMN public.efiling_meeting_attendees.attendee_type IS 'How user was invited: directly as USER, or via ROLE/ROLE_GROUP/TEAM';
COMMENT ON COLUMN public.efiling_meeting_attendees.source_id IS 'If invited via role/group/team, this stores the role_id/group_id/team_id';

-- -----------------------------------------------------------------------------
-- 9. efiling_meeting_external_attendees - External attendees (via email)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_meeting_external_attendees (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES public.efiling_meetings(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    organization VARCHAR(255),
    response_status VARCHAR(20) DEFAULT 'PENDING' CHECK (response_status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE')),
    attendance_status VARCHAR(20) CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'LATE', 'LEFT_EARLY')),
    invitation_sent BOOLEAN DEFAULT false,
    invitation_sent_at TIMESTAMP,
    email_sent_count INTEGER DEFAULT 0, -- Track how many times invitation was sent
    responded_at TIMESTAMP,
    responded_via VARCHAR(20) CHECK (responded_via IN ('EMAIL_LINK', 'EMAIL_REPLY')),
    response_token VARCHAR(100) UNIQUE, -- Unique token for email response links
    attended_at TIMESTAMP,
    left_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_meeting_external_email UNIQUE (meeting_id, email)
);

CREATE INDEX idx_meeting_external_meeting ON public.efiling_meeting_external_attendees(meeting_id);
CREATE INDEX idx_meeting_external_email ON public.efiling_meeting_external_attendees(email);
CREATE INDEX idx_meeting_external_response ON public.efiling_meeting_external_attendees(response_status);
CREATE INDEX idx_meeting_external_token ON public.efiling_meeting_external_attendees(response_token) WHERE response_token IS NOT NULL;
CREATE INDEX idx_meeting_external_sent ON public.efiling_meeting_external_attendees(invitation_sent) WHERE invitation_sent = true;

COMMENT ON TABLE public.efiling_meeting_external_attendees IS 'External attendees (3rd party) invited via email';
COMMENT ON COLUMN public.efiling_meeting_external_attendees.response_token IS 'Unique token for email response links (accept/decline via email)';

-- -----------------------------------------------------------------------------
-- 10. efiling_meeting_attachments - Agenda items and files
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_meeting_attachments (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES public.efiling_meetings(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size BIGINT, -- Size in bytes
    file_type VARCHAR(100), -- MIME type
    attachment_type VARCHAR(50) DEFAULT 'DOCUMENT' CHECK (attachment_type IN ('AGENDA', 'DOCUMENT', 'PRESENTATION', 'OTHER')),
    uploaded_by INTEGER NOT NULL REFERENCES public.efiling_users(id) ON DELETE RESTRICT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_meeting_attachments_meeting ON public.efiling_meeting_attachments(meeting_id);
CREATE INDEX idx_meeting_attachments_type ON public.efiling_meeting_attachments(attachment_type);
CREATE INDEX idx_meeting_attachments_uploaded_by ON public.efiling_meeting_attachments(uploaded_by);

COMMENT ON TABLE public.efiling_meeting_attachments IS 'Files and documents attached to meetings (agenda, presentations, etc.)';

-- -----------------------------------------------------------------------------
-- 11. efiling_meeting_reminders - Reminder tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.efiling_meeting_reminders (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER NOT NULL REFERENCES public.efiling_meetings(id) ON DELETE CASCADE,
    attendee_id INTEGER REFERENCES public.efiling_users(id) ON DELETE CASCADE, -- NULL for external attendees
    external_email VARCHAR(255), -- For external attendees
    reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('EMAIL', 'SMS', 'IN_APP')),
    reminder_sent_at TIMESTAMP,
    reminder_sent_status VARCHAR(20) CHECK (reminder_sent_status IN ('SUCCESS', 'FAILED', 'PENDING')),
    reminder_minutes_before INTEGER NOT NULL, -- Minutes before meeting (15, 30, 60, 1440 for 1 day)
    error_message TEXT, -- If reminder failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_attendee_or_email CHECK (
        (attendee_id IS NOT NULL AND external_email IS NULL) OR 
        (attendee_id IS NULL AND external_email IS NOT NULL)
    )
);

CREATE INDEX idx_meeting_reminders_meeting ON public.efiling_meeting_reminders(meeting_id);
CREATE INDEX idx_meeting_reminders_attendee ON public.efiling_meeting_reminders(attendee_id) WHERE attendee_id IS NOT NULL;
CREATE INDEX idx_meeting_reminders_email ON public.efiling_meeting_reminders(external_email) WHERE external_email IS NOT NULL;
CREATE INDEX idx_meeting_reminders_status ON public.efiling_meeting_reminders(reminder_sent_status);
CREATE INDEX idx_meeting_reminders_sent_at ON public.efiling_meeting_reminders(reminder_sent_at) WHERE reminder_sent_at IS NOT NULL;

COMMENT ON TABLE public.efiling_meeting_reminders IS 'Tracks meeting reminders sent to attendees (internal and external)';
COMMENT ON COLUMN public.efiling_meeting_reminders.reminder_minutes_before IS 'Minutes before meeting when reminder was sent (15, 30, 60, 1440 for 1 day)';

-- =============================================================================
-- TRIGGERS AND FUNCTIONS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to tables with updated_at column
CREATE TRIGGER trigger_efiling_daak_updated_at
    BEFORE UPDATE ON public.efiling_daak
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_efiling_daak_categories_updated_at
    BEFORE UPDATE ON public.efiling_daak_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_efiling_daak_recipients_updated_at
    BEFORE UPDATE ON public.efiling_daak_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_efiling_meetings_updated_at
    BEFORE UPDATE ON public.efiling_meetings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_efiling_meeting_attendees_updated_at
    BEFORE UPDATE ON public.efiling_meeting_attendees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_efiling_meeting_external_attendees_updated_at
    BEFORE UPDATE ON public.efiling_meeting_external_attendees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_efiling_meeting_settings_updated_at
    BEFORE UPDATE ON public.efiling_meeting_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- Insert default daak categories
INSERT INTO public.efiling_daak_categories (name, code, description, icon, color) VALUES
    ('Promotion', 'PROMOTION', 'Promotion notices and announcements', 'promotion', '#4CAF50'),
    ('Transfer', 'TRANSFER', 'Employee transfer notices', 'transfer', '#2196F3'),
    ('Notice', 'NOTICE', 'General notices and circulars', 'notice', '#FF9800'),
    ('Announcement', 'ANNOUNCEMENT', 'General announcements', 'announcement', '#9C27B0'),
    ('Order', 'ORDER', 'Official orders and directives', 'order', '#F44336'),
    ('Circular', 'CIRCULAR', 'Circular letters', 'circular', '#00BCD4')
ON CONFLICT (code) DO NOTHING;

-- Insert default meeting settings
INSERT INTO public.efiling_meeting_settings (setting_key, setting_value, description) VALUES
    ('default_reminder_minutes', '{"values": [15, 30, 60, 1440]}', 'Default reminder times in minutes (15min, 30min, 1hr, 1day)'),
    ('smtp_config', '{"host": "", "port": 587, "secure": false, "user": "", "password": ""}', 'SMTP configuration for email invitations'),
    ('timezone', '{"value": "Asia/Karachi"}', 'Default timezone for meetings'),
    ('email_templates', '{"invitation": "", "reminder": "", "cancellation": ""}', 'Email templates for meeting invitations')
ON CONFLICT (setting_key) DO NOTHING;

-- =============================================================================
-- PERMISSIONS
-- =============================================================================

-- Grant permissions (adjust as needed)
ALTER TABLE public.efiling_daak OWNER TO root;
ALTER TABLE public.efiling_daak_recipients OWNER TO root;
ALTER TABLE public.efiling_daak_acknowledgments OWNER TO root;
ALTER TABLE public.efiling_daak_attachments OWNER TO root;
ALTER TABLE public.efiling_daak_categories OWNER TO root;
ALTER TABLE public.efiling_meetings OWNER TO root;
ALTER TABLE public.efiling_meeting_attendees OWNER TO root;
ALTER TABLE public.efiling_meeting_external_attendees OWNER TO root;
ALTER TABLE public.efiling_meeting_attachments OWNER TO root;
ALTER TABLE public.efiling_meeting_reminders OWNER TO root;
ALTER TABLE public.efiling_meeting_settings OWNER TO root;

GRANT ALL ON ALL TABLES IN SCHEMA public TO root;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO root;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Run these queries to verify the migration:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'efiling_daak%' OR table_name LIKE 'efiling_meeting%' ORDER BY table_name;
-- SELECT * FROM efiling_daak_categories;
-- SELECT * FROM efiling_meeting_settings;

