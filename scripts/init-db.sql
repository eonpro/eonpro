-- Lifefile Production Database Initialization Script
-- This script sets up the PostgreSQL database for production use

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For encryption functions

-- Create schema for better organization
CREATE SCHEMA IF NOT EXISTS lifefile;

-- Set default schema
SET search_path TO lifefile, public;

-- Create audit log table for compliance
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    user_email VARCHAR(255),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    row_data JSONB,
    changed_fields JSONB
);

-- Create index for audit log queries
CREATE INDEX idx_audit_log_table_operation ON audit_log(table_name, operation);
CREATE INDEX idx_audit_log_changed_at ON audit_log(changed_at DESC);
CREATE INDEX idx_audit_log_user_email ON audit_log(user_email);

-- Function to automatically track changes
CREATE OR REPLACE FUNCTION track_changes() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, operation, user_email, row_data)
        VALUES (TG_TABLE_NAME, TG_OP, current_setting('app.current_user', true), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, operation, user_email, row_data, changed_fields)
        VALUES (TG_TABLE_NAME, TG_OP, current_setting('app.current_user', true), 
                row_to_json(NEW), 
                jsonb_object_agg(key, value) 
                FROM jsonb_each(row_to_json(NEW)::jsonb) 
                WHERE value IS DISTINCT FROM (row_to_json(OLD)::jsonb ->> key)::jsonb);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, operation, user_email, row_data)
        VALUES (TG_TABLE_NAME, TG_OP, current_setting('app.current_user', true), row_to_json(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA lifefile TO lifefile_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA lifefile TO lifefile_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA lifefile TO lifefile_user;

-- Performance settings for production
ALTER DATABASE lifefile_production SET shared_preload_libraries = 'pg_stat_statements';
ALTER DATABASE lifefile_production SET max_connections = 200;
ALTER DATABASE lifefile_production SET effective_cache_size = '4GB';
ALTER DATABASE lifefile_production SET maintenance_work_mem = '256MB';
ALTER DATABASE lifefile_production SET work_mem = '16MB';

-- Create performance monitoring views
CREATE OR REPLACE VIEW database_stats AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    n_live_tup AS row_count,
    n_dead_tup AS dead_rows,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

COMMENT ON VIEW database_stats IS 'Database statistics for monitoring table sizes and maintenance';

-- Create slow query monitoring
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time,
    rows
FROM pg_stat_statements
WHERE mean_exec_time > 100 -- queries slower than 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;

COMMENT ON VIEW slow_queries IS 'Top 20 slowest queries for performance optimization';
