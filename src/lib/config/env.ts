/**
 * Centralized Environment Configuration
 * =====================================
 * 
 * SECURITY: All environment variables are validated at startup
 * This prevents runtime errors from missing configuration
 * 
 * Usage:
 *   import { env } from '@/lib/config/env';
 *   console.log(env.DATABASE_URL);
 * 
 * @module lib/config/env
 */

import { z } from 'zod';

/**
 * Define the schema for all environment variables
 * Required vars will cause build/startup failure if missing
 * Optional vars have defaults or are nullable
 */
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  
  // Application URLs
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  
  // AWS
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_SES_FROM_EMAIL: z.string().email().optional(),
  
  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  
  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  
  // Zoom
  ZOOM_ACCOUNT_ID: z.string().optional(),
  ZOOM_CLIENT_ID: z.string().optional(),
  ZOOM_CLIENT_SECRET: z.string().optional(),
  
  // Sentry
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  
  // Redis (optional caching)
  REDIS_URL: z.string().optional(),
  
  // Feature flags
  NEXT_PUBLIC_ENABLE_MULTI_CLINIC: z.string().transform(v => v === 'true').optional(),
  
  // Security keys for setup endpoints
  ADMIN_SETUP_KEY: z.string().optional(),
  DB_INIT_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  
  // Lifefile Integration (Wellmedr)
  WELLMEDR_LIFEFILE_BASE_URL: z.string().url().optional(),
  WELLMEDR_LIFEFILE_USERNAME: z.string().optional(),
  WELLMEDR_LIFEFILE_PASSWORD: z.string().optional(),
  WELLMEDR_LIFEFILE_VENDOR_ID: z.string().optional(),
  WELLMEDR_LIFEFILE_PRACTICE_ID: z.string().optional(),
  WELLMEDR_LIFEFILE_LOCATION_ID: z.string().optional(),
  WELLMEDR_LIFEFILE_NETWORK_ID: z.string().optional(),
  WELLMEDR_LIFEFILE_PRACTICE_NAME: z.string().optional(),
  
  // Google Maps
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
});

/**
 * Type-safe environment configuration
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate and parse environment variables
 * This will throw an error if required variables are missing
 */
function validateEnv(): Env {
  // Skip validation during build time if DATABASE_URL is a placeholder
  const isBuildTime = process.env.DATABASE_URL === 'postgresql://placeholder';
  
  if (isBuildTime) {
    console.warn('[ENV] Build-time detected, using placeholder values');
    return {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://placeholder',
      JWT_SECRET: 'build-time-placeholder-secret-32chars!',
      AWS_REGION: 'us-east-1',
    } as Env;
  }

  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = result.error.issues.map(issue => {
      return `  - ${issue.path.join('.')}: ${issue.message}`;
    }).join('\n');
    
    console.error('❌ Invalid environment configuration:\n' + errors);
    
    // In production, fail hard. In development, warn but continue
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid environment configuration. See logs for details.');
    }
    
    console.warn('⚠️ Continuing with partial configuration (development mode)');
    // Return partial config with defaults
    return envSchema.partial().parse(process.env) as Env;
  }
  
  return result.data;
}

/**
 * Validated environment configuration
 * Access via: import { env } from '@/lib/config/env';
 */
export const env = validateEnv();

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: string): boolean {
  const featureKey = `NEXT_PUBLIC_ENABLE_${feature.toUpperCase()}` as keyof Env;
  return env[featureKey] === true;
}

/**
 * Get required environment variable with helpful error
 */
export function getRequiredEnv(key: keyof Env): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return String(value);
}

/**
 * Get optional environment variable with default
 */
export function getOptionalEnv(key: keyof Env, defaultValue: string = ''): string {
  return String(env[key] ?? defaultValue);
}
