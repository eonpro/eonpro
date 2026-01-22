/**
 * AWS Secrets Manager Integration
 * ================================
 * 
 * Fetches secrets from AWS Secrets Manager for production environments.
 * Falls back to environment variables for development.
 * 
 * @module secrets/aws-secrets
 * @security CRITICAL - Handles all secret retrieval
 */

import { logger } from '@/lib/logger';

// Lazy load AWS SDK to avoid issues in non-AWS environments
let secretsManagerClient: any = null;

interface SecretCache {
  value: string;
  expiresAt: number;
}

// In-memory cache with TTL
const secretCache = new Map<string, SecretCache>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if AWS Secrets Manager should be used
 */
export function isSecretsManagerEnabled(): boolean {
  return Boolean(
    process.env.USE_AWS_SECRETS === 'true' ||
    (process.env.NODE_ENV === 'production' && process.env.AWS_REGION)
  );
}

/**
 * Get the Secrets Manager client (lazy initialization)
 */
async function getClient() {
  if (secretsManagerClient) {
    return secretsManagerClient;
  }

  const { SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager');
  
  secretsManagerClient = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
  
  return secretsManagerClient;
}

/**
 * Get a secret from AWS Secrets Manager
 * 
 * @param secretId - The secret name or ARN
 * @param property - Optional JSON property to extract
 * @returns The secret value
 */
export async function getSecret(
  secretId: string,
  property?: string
): Promise<string> {
  // Check cache first
  const cacheKey = `${secretId}:${property || ''}`;
  const cached = secretCache.get(cacheKey);
  
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  // If not using Secrets Manager, fall back to environment variable
  if (!isSecretsManagerEnabled()) {
    const envKey = secretId.replace(/\//g, '_').toUpperCase();
    const envValue = process.env[envKey];
    
    if (!envValue) {
      throw new Error(`Secret not found: ${secretId} (env: ${envKey})`);
    }
    
    return property ? JSON.parse(envValue)[property] : envValue;
  }

  try {
    const client = await getClient();
    const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error(`Secret ${secretId} has no string value`);
    }

    let value: string;
    
    if (property) {
      const parsed = JSON.parse(response.SecretString);
      value = parsed[property];
      
      if (value === undefined) {
        throw new Error(`Property ${property} not found in secret ${secretId}`);
      }
    } else {
      value = response.SecretString;
    }

    // Cache the result
    secretCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return value;
  } catch (error) {
    logger.error(`Failed to get secret: ${secretId}`, error as Error);
    throw error;
  }
}

/**
 * Get multiple secrets at once
 */
export async function getSecrets(
  secrets: Array<{ id: string; property?: string }>
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  
  await Promise.all(
    secrets.map(async ({ id, property }) => {
      results[id] = await getSecret(id, property);
    })
  );
  
  return results;
}

/**
 * Clear the secret cache (call on security events)
 */
export function clearSecretCache(): void {
  secretCache.clear();
  logger.security('Secret cache cleared');
}

/**
 * Initialize secrets from AWS Secrets Manager
 * Call at application startup
 */
export async function initializeSecrets(): Promise<void> {
  if (!isSecretsManagerEnabled()) {
    logger.info('AWS Secrets Manager disabled, using environment variables');
    return;
  }

  logger.info('Initializing secrets from AWS Secrets Manager');
  
  // Pre-fetch critical secrets
  const criticalSecrets = [
    'eonpro/prod/auth',
    'eonpro/prod/encryption',
    'eonpro/prod/database',
  ];

  try {
    for (const secretId of criticalSecrets) {
      await getSecret(secretId);
    }
    logger.info('All critical secrets loaded successfully');
  } catch (error) {
    logger.error('Failed to load critical secrets', error as Error);
    throw error;
  }
}

// Export types
export interface AWSSecret {
  ARN: string;
  Name: string;
  VersionId: string;
  SecretString?: string;
}
