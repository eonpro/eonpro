#!/usr/bin/env npx tsx
/**
 * Secrets Validation Script
 * =========================
 * 
 * Validates that all required secrets are configured properly.
 * Run this before deployment to catch missing or invalid secrets.
 * 
 * Usage:
 *   npm run validate:secrets
 *   npx tsx scripts/validate-secrets.ts
 * 
 * @security Run in CI/CD pipeline before deployment
 */

interface SecretConfig {
  name: string;
  envVar: string;
  required: boolean;
  minLength?: number;
  pattern?: RegExp;
  description: string;
}

const REQUIRED_SECRETS: SecretConfig[] = [
  {
    name: 'JWT Secret',
    envVar: 'JWT_SECRET',
    required: true,
    minLength: 64, // 32 bytes in hex
    pattern: /^[a-f0-9]{64}$/i,
    description: 'JWT signing secret (32 bytes hex)',
  },
  {
    name: 'Encryption Key',
    envVar: 'ENCRYPTION_KEY',
    required: true,
    minLength: 64,
    pattern: /^[a-f0-9]{64}$/i,
    description: 'PHI encryption key (32 bytes hex)',
  },
  {
    name: 'Database URL',
    envVar: 'DATABASE_URL',
    required: true,
    pattern: /^postgres(ql)?:\/\/.+/,
    description: 'PostgreSQL connection string',
  },
];

const OPTIONAL_SECRETS: SecretConfig[] = [
  {
    name: 'Stripe Secret Key',
    envVar: 'STRIPE_SECRET_KEY',
    required: false,
    pattern: /^sk_(test|live)_[a-zA-Z0-9]+$/,
    description: 'Stripe API secret key',
  },
  {
    name: 'Twilio Auth Token',
    envVar: 'TWILIO_AUTH_TOKEN',
    required: false,
    minLength: 32,
    description: 'Twilio authentication token',
  },
  {
    name: 'Twilio Account SID',
    envVar: 'TWILIO_ACCOUNT_SID',
    required: false,
    pattern: /^AC[a-f0-9]{32}$/,
    description: 'Twilio account SID',
  },
  {
    name: 'Lifefile API Key',
    envVar: 'LIFEFILE_API_KEY',
    required: false,
    description: 'Lifefile pharmacy API key',
  },
  {
    name: 'OpenAI API Key',
    envVar: 'OPENAI_API_KEY',
    required: false,
    pattern: /^sk-[a-zA-Z0-9-]+$/,
    description: 'OpenAI API key for AI features',
  },
  {
    name: 'Sentry DSN',
    envVar: 'SENTRY_DSN',
    required: false,
    pattern: /^https:\/\/[a-f0-9]+@[a-z0-9.]+\.sentry\.io\/\d+$/,
    description: 'Sentry error tracking DSN',
  },
  {
    name: 'AWS KMS Key ID',
    envVar: 'AWS_KMS_KEY_ID',
    required: false,
    pattern: /^[a-f0-9-]{36}$|^arn:aws:kms:.+/,
    description: 'AWS KMS key for production encryption',
  },
];

interface ValidationResult {
  name: string;
  envVar: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  message: string;
}

function validateSecret(config: SecretConfig): ValidationResult {
  const value = process.env[config.envVar];
  
  // Check if present
  if (!value) {
    if (config.required) {
      return {
        name: config.name,
        envVar: config.envVar,
        status: 'FAIL',
        message: `Missing required secret`,
      };
    }
    return {
      name: config.name,
      envVar: config.envVar,
      status: 'SKIP',
      message: `Not configured (optional)`,
    };
  }
  
  // Check minimum length
  if (config.minLength && value.length < config.minLength) {
    return {
      name: config.name,
      envVar: config.envVar,
      status: 'FAIL',
      message: `Too short: ${value.length} chars (min: ${config.minLength})`,
    };
  }
  
  // Check pattern
  if (config.pattern && !config.pattern.test(value)) {
    return {
      name: config.name,
      envVar: config.envVar,
      status: 'WARN',
      message: `Format doesn't match expected pattern`,
    };
  }
  
  return {
    name: config.name,
    envVar: config.envVar,
    status: 'PASS',
    message: `Valid (${value.length} chars)`,
  };
}

function main() {
  console.log('\n========================================');
  console.log('SECRETS VALIDATION');
  console.log('========================================\n');
  
  const env = process.env.NODE_ENV || 'development';
  console.log(`Environment: ${env}\n`);
  
  const results: ValidationResult[] = [];
  let hasFailures = false;
  
  // Validate required secrets
  console.log('Required Secrets:');
  console.log('-----------------');
  
  for (const config of REQUIRED_SECRETS) {
    const result = validateSecret(config);
    results.push(result);
    
    const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '⚠';
    console.log(`  ${icon} ${config.envVar}: ${result.message}`);
    
    if (result.status === 'FAIL') {
      hasFailures = true;
    }
  }
  
  // Validate optional secrets
  console.log('\nOptional Secrets:');
  console.log('-----------------');
  
  for (const config of OPTIONAL_SECRETS) {
    const result = validateSecret(config);
    results.push(result);
    
    const icon = result.status === 'PASS' ? '✓' : 
                 result.status === 'SKIP' ? '○' :
                 result.status === 'WARN' ? '⚠' : '✗';
    console.log(`  ${icon} ${config.envVar}: ${result.message}`);
  }
  
  // Security checks
  console.log('\nSecurity Checks:');
  console.log('----------------');
  
  // Check for default/example values
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret && (
    jwtSecret.includes('example') ||
    jwtSecret.includes('test') ||
    jwtSecret === 'your-secret-here' ||
    jwtSecret.length < 32
  )) {
    console.log('  ✗ JWT_SECRET appears to be a placeholder value');
    hasFailures = true;
  } else if (jwtSecret) {
    console.log('  ✓ JWT_SECRET appears to be properly generated');
  }
  
  // Check encryption key
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey && (
    encKey.includes('example') ||
    encKey === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )) {
    console.log('  ✗ ENCRYPTION_KEY appears to be a placeholder value');
    hasFailures = true;
  } else if (encKey) {
    console.log('  ✓ ENCRYPTION_KEY appears to be properly generated');
  }
  
  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Warned:  ${warned}`);
  console.log(`  Skipped: ${skipped}`);
  console.log('========================================\n');
  
  if (hasFailures) {
    console.log('❌ Validation FAILED - Fix required secrets before deployment\n');
    process.exit(1);
  } else if (warned > 0) {
    console.log('⚠️  Validation passed with warnings\n');
    process.exit(0);
  } else {
    console.log('✅ All secrets validated successfully\n');
    process.exit(0);
  }
}

main();
