-- =====================================================
-- PostgreSQL Production Database Setup
-- Lifefile Health Platform
-- =====================================================
-- Run this script as a superuser to set up the database

-- Create the production database
CREATE DATABASE lifefile_prod
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.utf8'
    LC_CTYPE = 'en_US.utf8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = 100;

-- Connect to the new database
\c lifefile_prod;

-- =====================================================
-- Extensions
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Encryption functions
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance monitoring
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Text search improvements

-- =====================================================
-- Schemas
-- =====================================================
-- Main application schema (created by default as 'public')
-- Audit schema for compliance
CREATE SCHEMA IF NOT EXISTS audit;
-- Archive schema for old data
CREATE SCHEMA IF NOT EXISTS archive;

-- =====================================================
-- Roles and Permissions
-- =====================================================
-- Application user (limited privileges)
CREATE USER lifefile_app WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD';
GRANT CONNECT ON DATABASE lifefile_prod TO lifefile_app;
GRANT USAGE ON SCHEMA public TO lifefile_app;
GRANT CREATE ON SCHEMA public TO lifefile_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO lifefile_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lifefile_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO lifefile_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO lifefile_app;

-- Read-only user for analytics
CREATE USER lifefile_readonly WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD';
GRANT CONNECT ON DATABASE lifefile_prod TO lifefile_readonly;
GRANT USAGE ON SCHEMA public TO lifefile_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO lifefile_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO lifefile_readonly;

-- Backup user
CREATE USER lifefile_backup WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD';
GRANT CONNECT ON DATABASE lifefile_prod TO lifefile_backup;
GRANT USAGE ON SCHEMA public, audit, archive TO lifefile_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public, audit, archive TO lifefile_backup;

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================
-- Enable RLS on all tables (will be configured per table)
ALTER DATABASE lifefile_prod SET row_security = on;

-- =====================================================
-- Helper Functions
-- =====================================================
-- Function to automatically update updatedAt timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for soft deletes
CREATE OR REPLACE FUNCTION public.soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    NEW."deletedAt" = CURRENT_TIMESTAMP;
    NEW."isDeleted" = true;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Audit Functions
-- =====================================================
-- Audit log table
CREATE TABLE IF NOT EXISTS audit.audit_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    user_id INTEGER,
    clinic_id INTEGER,
    row_id INTEGER,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    integrity_hash VARCHAR(64)
);

-- Index for audit log queries
CREATE INDEX idx_audit_log_table_operation ON audit.audit_log(table_name, operation);
CREATE INDEX idx_audit_log_user_id ON audit.audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit.audit_log(created_at);
CREATE INDEX idx_audit_log_clinic_id ON audit.audit_log(clinic_id);

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit.audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    audit_row audit.audit_log;
    row_data JSONB;
    excluded_cols TEXT[] := ARRAY['updatedAt'];
BEGIN
    IF TG_OP = 'INSERT' THEN
        audit_row.old_data = NULL;
        audit_row.new_data = to_jsonb(NEW);
        audit_row.row_id = NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        audit_row.old_data = to_jsonb(OLD);
        audit_row.new_data = to_jsonb(NEW);
        audit_row.row_id = NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        audit_row.old_data = to_jsonb(OLD);
        audit_row.new_data = NULL;
        audit_row.row_id = OLD.id;
    END IF;
    
    audit_row.table_name = TG_TABLE_NAME;
    audit_row.operation = TG_OP;
    audit_row.user_id = current_setting('app.current_user_id', true)::INTEGER;
    audit_row.clinic_id = current_setting('app.current_clinic_id', true)::INTEGER;
    audit_row.created_at = CURRENT_TIMESTAMP;
    
    -- Generate integrity hash
    audit_row.integrity_hash = encode(
        digest(
            audit_row.table_name || 
            audit_row.operation || 
            COALESCE(audit_row.old_data::TEXT, '') || 
            COALESCE(audit_row.new_data::TEXT, ''),
            'sha256'
        ),
        'hex'
    );
    
    INSERT INTO audit.audit_log VALUES (audit_row.*);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Performance Configuration
-- =====================================================
-- Connection pooling settings
ALTER DATABASE lifefile_prod SET idle_in_transaction_session_timeout = '5min';
ALTER DATABASE lifefile_prod SET statement_timeout = '30s';
ALTER DATABASE lifefile_prod SET lock_timeout = '10s';

-- Query optimization
ALTER DATABASE lifefile_prod SET random_page_cost = 1.1;
ALTER DATABASE lifefile_prod SET effective_cache_size = '3GB';
ALTER DATABASE lifefile_prod SET shared_buffers = '1GB';
ALTER DATABASE lifefile_prod SET work_mem = '10MB';

-- =====================================================
-- Backup Configuration
-- =====================================================
-- Create backup schema
CREATE SCHEMA IF NOT EXISTS backup;

-- Backup function
CREATE OR REPLACE FUNCTION backup.create_backup_tables()
RETURNS void AS $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('CREATE TABLE IF NOT EXISTS backup.%I AS TABLE public.%I WITH NO DATA',
                      table_record.tablename || '_' || to_char(NOW(), 'YYYYMMDD'),
                      table_record.tablename);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Security Policies
-- =====================================================
-- Password policy
ALTER DATABASE lifefile_prod SET password_encryption = 'scram-sha-256';

-- SSL enforcement (configure in postgresql.conf)
-- ssl = on
-- ssl_cert_file = 'server.crt'
-- ssl_key_file = 'server.key'
-- ssl_ca_file = 'root.crt'

-- =====================================================
-- Monitoring Views
-- =====================================================
-- Active connections view
CREATE OR REPLACE VIEW public.active_connections AS
SELECT 
    pid,
    usename,
    application_name,
    client_addr,
    state,
    query_start,
    state_change,
    query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start DESC;

-- Slow queries view
CREATE OR REPLACE VIEW public.slow_queries AS
SELECT 
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time,
    query
FROM pg_stat_statements
WHERE mean_exec_time > 100 -- queries slower than 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Table sizes view
CREATE OR REPLACE VIEW public.table_sizes AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- =====================================================
-- Maintenance Jobs (to be scheduled with pg_cron or external scheduler)
-- =====================================================
-- Vacuum analyze function
CREATE OR REPLACE FUNCTION maintenance.vacuum_analyze_tables()
RETURNS void AS $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('VACUUM ANALYZE %I.%I', table_record.schemaname, table_record.tablename);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Archive old audit logs
CREATE OR REPLACE FUNCTION maintenance.archive_old_audit_logs()
RETURNS void AS $$
BEGIN
    -- Move audit logs older than 6 years to archive
    INSERT INTO archive.audit_log_archive
    SELECT * FROM audit.audit_log
    WHERE created_at < CURRENT_DATE - INTERVAL '6 years';
    
    DELETE FROM audit.audit_log
    WHERE created_at < CURRENT_DATE - INTERVAL '6 years';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Grant Permissions to Application User
-- =====================================================
GRANT USAGE ON SCHEMA audit TO lifefile_app;
GRANT INSERT ON audit.audit_log TO lifefile_app;
GRANT USAGE ON SEQUENCE audit.audit_log_id_seq TO lifefile_app;

-- =====================================================
-- Final Security Settings
-- =====================================================
-- Revoke public access
REVOKE ALL ON DATABASE lifefile_prod FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO lifefile_app, lifefile_readonly;

-- =====================================================
-- Success Message
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ PostgreSQL production database setup complete!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Update application DATABASE_URL to use lifefile_app user';
    RAISE NOTICE '2. Run Prisma migrations: npx prisma migrate deploy';
    RAISE NOTICE '3. Enable audit triggers on sensitive tables';
    RAISE NOTICE '4. Configure automated backups';
    RAISE NOTICE '5. Set up monitoring and alerting';
    RAISE NOTICE '';
    RAISE NOTICE 'Security reminders:';
    RAISE NOTICE '- Change all default passwords';
    RAISE NOTICE '- Enable SSL/TLS connections';
    RAISE NOTICE '- Configure firewall rules';
    RAISE NOTICE '- Set up regular security audits';
END $$;
