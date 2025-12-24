-- Security Tables for Video Archiving System
-- This schema implements comprehensive security logging and monitoring

-- Security Events Table
CREATE TABLE IF NOT EXISTS public.security_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    user_id INTEGER NULL,
    ip_address INET NOT NULL,
    details JSONB NULL,
    severity VARCHAR(20) DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT NULL,
    session_id VARCHAR(255) NULL,
    request_method VARCHAR(10) NULL,
    request_url TEXT NULL,
    response_status INTEGER NULL,
    processing_time_ms INTEGER NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON public.security_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON public.security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events(severity);

-- Secure Files Table
CREATE TABLE IF NOT EXISTS public.secure_files (
    id SERIAL PRIMARY KEY,
    original_name VARCHAR(255) NOT NULL,
    secure_name VARCHAR(255) NOT NULL UNIQUE,
    file_hash VARCHAR(64) NOT NULL,
    checksum VARCHAR(32) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by INTEGER NOT NULL,
    uploaded_at TIMESTAMP NOT NULL,
    storage_path TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP NULL,
    virus_scan_status VARCHAR(20) DEFAULT 'PENDING' CHECK (virus_scan_status IN ('PENDING', 'CLEAN', 'INFECTED', 'ERROR')),
    virus_scan_date TIMESTAMP NULL,
    virus_scan_result JSONB NULL,
    file_integrity_verified BOOLEAN DEFAULT false,
    integrity_check_date TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for secure files
CREATE INDEX IF NOT EXISTS idx_secure_files_hash ON public.secure_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_secure_files_type ON public.secure_files(file_type);
CREATE INDEX IF NOT EXISTS idx_secure_files_uploaded_by ON public.secure_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_secure_files_active ON public.secure_files(is_active);
CREATE INDEX IF NOT EXISTS idx_secure_files_virus_scan ON public.secure_files(virus_scan_status);

-- Access Control Table
CREATE TABLE IF NOT EXISTS public.access_control (
    id SERIAL PRIMARY KEY,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INTEGER NOT NULL,
    user_id INTEGER NULL,
    role_id INTEGER NULL,
    ip_address INET NULL,
    action VARCHAR(50) NOT NULL,
    allowed BOOLEAN NOT NULL,
    reason TEXT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for access control
CREATE INDEX IF NOT EXISTS idx_access_control_resource ON public.access_control(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_access_control_user ON public.access_control(user_id);
CREATE INDEX IF NOT EXISTS idx_access_control_role ON public.access_control(role_id);
CREATE INDEX IF NOT EXISTS idx_access_control_timestamp ON public.access_control(timestamp);

-- Rate Limiting Table
CREATE TABLE IF NOT EXISTS public.rate_limiting (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    rate_limit_type VARCHAR(50) NOT NULL,
    request_count INTEGER DEFAULT 1,
    first_request TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_request TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_blocked BOOLEAN DEFAULT false,
    block_reason TEXT NULL,
    block_until TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for rate limiting
CREATE INDEX IF NOT EXISTS idx_rate_limiting_identifier ON public.rate_limiting(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limiting_type ON public.rate_limiting(rate_limit_type);
CREATE INDEX IF NOT EXISTS idx_rate_limiting_window ON public.rate_limiting(window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limiting_blocked ON public.rate_limiting(is_blocked);

-- Suspicious Activity Table
CREATE TABLE IF NOT EXISTS public.suspicious_activity (
    id SERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    user_id INTEGER NULL,
    activity_type VARCHAR(100) NOT NULL,
    patterns JSONB NOT NULL,
    severity VARCHAR(20) DEFAULT 'WARNING' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description TEXT NULL,
    user_agent TEXT NULL,
    referer TEXT NULL,
    request_count INTEGER DEFAULT 1,
    first_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_blocked BOOLEAN DEFAULT false,
    block_reason TEXT NULL,
    block_until TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for suspicious activity
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_ip ON public.suspicious_activity(ip_address);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_type ON public.suspicious_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_severity ON public.suspicious_activity(severity);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_blocked ON public.suspicious_activity(is_blocked);

-- Public Access Log Table
CREATE TABLE IF NOT EXISTS public.public_access_log (
    id SERIAL PRIMARY KEY,
    media_type VARCHAR(50) NOT NULL,
    media_id INTEGER NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT NULL,
    referer TEXT NULL,
    access_granted BOOLEAN NOT NULL,
    reason TEXT NULL,
    response_time_ms INTEGER NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255) NULL,
    geographic_location JSONB NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for public access log
CREATE INDEX IF NOT EXISTS idx_public_access_media ON public.public_access_log(media_type, media_id);
CREATE INDEX IF NOT EXISTS idx_public_access_ip ON public.public_access_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_public_access_timestamp ON public.public_access_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_public_access_granted ON public.public_access_log(access_granted);

-- Security Configuration Table
CREATE TABLE IF NOT EXISTS public.security_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value JSONB NOT NULL,
    description TEXT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default security configurations
INSERT INTO public.security_config (config_key, config_value, description) VALUES
('rate_limits', '{"API_CALLS": {"max": 100, "windowMs": 900000}, "FILE_UPLOADS": {"max": 10, "windowMs": 3600000}, "LOGIN_ATTEMPTS": {"max": 5, "windowMs": 900000}, "PUBLIC_VIEWS": {"max": 1000, "windowMs": 3600000}}', 'Rate limiting configuration for different operations'),
('file_upload', '{"MAX_FILE_SIZE": 524288000, "ALLOWED_VIDEO_TYPES": ["video/mp4", "video/avi", "video/mov", "video/wmv", "video/flv"], "ALLOWED_IMAGE_TYPES": ["image/jpeg", "image/png", "image/gif", "image/webp"], "ALLOWED_DOCUMENT_TYPES": ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]}', 'File upload security configuration'),
('session_security', '{"MAX_AGE": 7200000, "REGENERATE_ID": true, "SECURE_COOKIES": true, "HTTP_ONLY": true, "SAME_SITE": "strict"}', 'Session security configuration'),
('input_validation', '{"MAX_STRING_LENGTH": 1000, "ALLOWED_HTML_TAGS": ["b", "i", "u", "strong", "em"]}', 'Input validation configuration'),
('access_control', '{"ADMIN_ROLES": [1, 2], "AGENT_ROLES": [3, 4], "SOCIAL_MEDIA_ROLES": [5, 6]}', 'Access control configuration')
ON CONFLICT (config_key) DO NOTHING;

-- Security Audit Log Table
CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB NULL,
    new_values JSONB NULL,
    changed_by INTEGER NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET NULL,
    user_agent TEXT NULL,
    session_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for security audit log
CREATE INDEX IF NOT EXISTS idx_security_audit_table ON public.security_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_action ON public.security_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_security_audit_changed_by ON public.security_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_security_audit_timestamp ON public.security_audit_log(changed_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_secure_files_updated_at BEFORE UPDATE ON public.secure_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limiting_updated_at BEFORE UPDATE ON public.rate_limiting
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suspicious_activity_updated_at BEFORE UPDATE ON public.suspicious_activity
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_security_config_updated_at BEFORE UPDATE ON public.security_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
    p_event_type VARCHAR(100),
    p_user_id INTEGER,
    p_ip_address INET,
    p_details JSONB,
    p_severity VARCHAR(20) DEFAULT 'INFO',
    p_user_agent TEXT DEFAULT NULL,
    p_session_id VARCHAR(255) DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_event_id INTEGER;
BEGIN
    INSERT INTO public.security_events (
        event_type, user_id, ip_address, details, severity, 
        user_agent, session_id, timestamp
    ) VALUES (
        p_event_type, p_user_id, p_ip_address, p_details, p_severity,
        p_user_agent, p_session_id, CURRENT_TIMESTAMP
    ) RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to check rate limiting
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier VARCHAR(255),
    p_rate_limit_type VARCHAR(50),
    p_max_requests INTEGER,
    p_window_ms INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_current_count INTEGER;
    v_is_allowed BOOLEAN;
    v_remaining INTEGER;
    v_window_start TIMESTAMP;
BEGIN
    -- Calculate window start
    v_window_start := CURRENT_TIMESTAMP - (p_window_ms || ' milliseconds')::INTERVAL;
    
    -- Get current request count in window
    SELECT COALESCE(SUM(request_count), 0)
    INTO v_current_count
    FROM public.rate_limiting
    WHERE identifier = p_identifier 
      AND rate_limit_type = p_rate_limit_type
      AND window_start >= v_window_start;
    
    -- Check if allowed
    v_is_allowed := v_current_count < p_max_requests;
    v_remaining := GREATEST(0, p_max_requests - v_current_count);
    
    -- Log the request
    INSERT INTO public.rate_limiting (
        identifier, rate_limit_type, request_count, 
        window_start, last_request
    ) VALUES (
        p_identifier, p_rate_limit_type, 1, 
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) ON CONFLICT (identifier, rate_limit_type, window_start) 
    DO UPDATE SET 
        request_count = rate_limiting.request_count + 1,
        last_request = CURRENT_TIMESTAMP;
    
    RETURN jsonb_build_object(
        'allowed', v_is_allowed,
        'remaining', v_remaining,
        'current_count', v_current_count + 1,
        'window_start', v_window_start
    );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed for your database setup)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- Create comments for documentation
COMMENT ON TABLE public.security_events IS 'Logs all security-related events in the system';
COMMENT ON TABLE public.secure_files IS 'Stores metadata for securely uploaded files';
COMMENT ON TABLE public.access_control IS 'Logs access control decisions and attempts';
COMMENT ON TABLE public.rate_limiting IS 'Tracks rate limiting for various operations';
COMMENT ON TABLE public.suspicious_activity IS 'Logs suspicious activity patterns';
COMMENT ON TABLE public.public_access_log IS 'Logs public access to media files';
COMMENT ON TABLE public.security_config IS 'Stores security configuration parameters';
COMMENT ON TABLE public.security_audit_log IS 'Audit trail for security-related table changes';
