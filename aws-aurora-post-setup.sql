-- EONPRO Aurora PostgreSQL Post-Setup Script
-- Run these commands after database creation

-- 1. Create application user (don't use master user in app)
CREATE USER eonpro_app WITH PASSWORD 'ChangeThisSecurePassword123!';

-- 2. Create application database
CREATE DATABASE eonpro_db OWNER eonpro_app;

-- 3. Grant permissions
GRANT ALL PRIVILEGES ON DATABASE eonpro_db TO eonpro_app;

-- 4. Connect to eonpro_db and run:
\c eonpro_db

-- 5. Create schema
CREATE SCHEMA IF NOT EXISTS eonpro AUTHORIZATION eonpro_app;

-- 6. Set search path
ALTER DATABASE eonpro_db SET search_path TO eonpro, public;

-- 7. Enable extensions for application
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- 8. Create audit table for HIPAA compliance
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    action VARCHAR(100),
    resource VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Create index for audit queries
CREATE INDEX idx_audit_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_action ON audit_log(action);

-- 10. Set up row-level security (optional but recommended)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 11. Create backup user (for automated backups)
CREATE USER backup_user WITH PASSWORD 'BackupPassword456!';
GRANT CONNECT ON DATABASE eonpro_db TO backup_user;
GRANT USAGE ON SCHEMA eonpro TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA eonpro TO backup_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA eonpro GRANT SELECT ON TABLES TO backup_user;

-- 12. Performance settings (adjust based on instance size)
-- Run as superuser:
ALTER SYSTEM SET shared_buffers = '8GB';  -- 25% of RAM
ALTER SYSTEM SET effective_cache_size = '24GB';  -- 75% of RAM
ALTER SYSTEM SET maintenance_work_mem = '2GB';
ALTER SYSTEM SET work_mem = '32MB';
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET random_page_cost = 1.1;  -- For SSD

-- 13. Logging for HIPAA compliance
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_duration = on;
ALTER SYSTEM SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';

-- 14. Apply settings (requires restart)
-- Aurora will handle this automatically

COMMENT ON DATABASE eonpro_db IS 'EONPRO Healthcare Platform - HIPAA Compliant Database';
