-- PostgreSQL initialization script for Lifefile EHR

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create database if not exists
-- Note: This is usually handled by Docker environment variables
-- but included here for completeness

-- Set performance parameters
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET max_connections = '200';
ALTER SYSTEM SET random_page_cost = '1.1';
ALTER SYSTEM SET effective_io_concurrency = '200';
ALTER SYSTEM SET min_wal_size = '1GB';
ALTER SYSTEM SET max_wal_size = '4GB';
ALTER SYSTEM SET checkpoint_completion_target = '0.9';
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = '100';

-- Create schemas for multi-tenancy (if needed)
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS analytics;

-- Grant permissions
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT ALL ON SCHEMA audit TO PUBLIC;
GRANT ALL ON SCHEMA analytics TO PUBLIC;

-- Create audit function for tracking changes
CREATE OR REPLACE FUNCTION audit.if_modified_func() RETURNS TRIGGER AS $body$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at = CURRENT_TIMESTAMP;
        NEW.updated_at = CURRENT_TIMESTAMP;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.created_at = OLD.created_at;
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

-- Create function for soft deletes
CREATE OR REPLACE FUNCTION public.soft_delete() RETURNS TRIGGER AS $body$
BEGIN
    NEW.deleted_at = CURRENT_TIMESTAMP;
    NEW.is_deleted = true;
    RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

-- Create function for generating UUIDs
CREATE OR REPLACE FUNCTION public.generate_ulid() RETURNS TEXT AS $$
DECLARE
    timestamp BYTEA;
    random_bytes BYTEA;
    output TEXT;
BEGIN
    timestamp = E'\\x' || lpad(to_hex(floor(extract(epoch from CURRENT_TIMESTAMP) * 1000)::BIGINT), 12, '0');
    random_bytes = gen_random_bytes(10);
    output = encode(timestamp || random_bytes, 'base64');
    output = translate(output, '/+', '_-');
    output = rtrim(output, '=');
    RETURN output;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for common queries
-- Note: These will be created by Prisma migrations, but included here for reference
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_provider_id ON patients(provider_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_patient_id ON orders(patient_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_influencer_id ON orders(influencer_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_soap_notes_patient_id ON soap_notes(patient_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_provider_id ON appointments(provider_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_start_time ON appointments(start_time);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

-- Create materialized view for analytics (example)
-- CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.daily_stats AS
-- SELECT 
--     DATE(created_at) as date,
--     COUNT(DISTINCT patient_id) as unique_patients,
--     COUNT(DISTINCT provider_id) as active_providers,
--     COUNT(*) as total_appointments
-- FROM appointments
-- WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
-- GROUP BY DATE(created_at)
-- WITH DATA;

-- Create index on materialized view
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_stats_date ON analytics.daily_stats(date);

-- Refresh materialized view periodically
-- CREATE OR REPLACE FUNCTION analytics.refresh_daily_stats() RETURNS void AS $$
-- BEGIN
--     REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.daily_stats;
-- END;
-- $$ LANGUAGE plpgsql;

-- Setup pg_cron for scheduled tasks (if extension is available)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('refresh-daily-stats', '0 1 * * *', 'SELECT analytics.refresh_daily_stats();');

-- Create read-only user for analytics (optional)
CREATE USER analytics_readonly WITH PASSWORD 'analytics_readonly_password';
GRANT CONNECT ON DATABASE lifefile_ehr TO analytics_readonly;
GRANT USAGE ON SCHEMA analytics TO analytics_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO analytics_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO analytics_readonly;

-- Create backup user (optional)
CREATE USER backup_user WITH PASSWORD 'backup_password' REPLICATION;
GRANT CONNECT ON DATABASE lifefile_ehr TO backup_user;
GRANT USAGE ON SCHEMA public TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;

-- Vacuum and analyze for optimal performance
-- VACUUM ANALYZE;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Database initialization completed successfully';
END $$;
