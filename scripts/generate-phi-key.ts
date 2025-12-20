#!/usr/bin/env npx tsx
/**
 * Generate a new PHI encryption key using AWS KMS
 * 
 * This script:
 * 1. Connects to AWS KMS
 * 2. Generates a new data encryption key
 * 3. Outputs the encrypted key for storage in environment variables
 * 
 * Usage:
 *   AWS_REGION=us-east-1 AWS_KMS_KEY_ID=your-key-id npx tsx scripts/generate-phi-key.ts
 */

import { KMSClient, GenerateDataKeyCommand } from '@aws-sdk/client-kms';

async function main() {
  console.log('🔐 Generating PHI Encryption Key using AWS KMS\n');

  // Check required environment variables
  const keyId = process.env.AWS_KMS_KEY_ID;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!keyId) {
    console.error('❌ Error: AWS_KMS_KEY_ID environment variable is required');
    console.error('\nUsage:');
    console.error('  AWS_REGION=us-east-1 AWS_KMS_KEY_ID=arn:aws:kms:... npx tsx scripts/generate-phi-key.ts');
    process.exit(1);
  }

  console.log(`📍 Region: ${region}`);
  console.log(`🔑 KMS Key ID: ${keyId.substring(0, 50)}...`);

  try {
    // Create KMS client
    const client = new KMSClient({ region });

    // Generate a data encryption key
    console.log('\n⏳ Generating data encryption key...');
    
    const command = new GenerateDataKeyCommand({
      KeyId: keyId,
      KeySpec: 'AES_256',
    });

    const response = await client.send(command);

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('KMS did not return key material');
    }

    const encryptedKey = Buffer.from(response.CiphertextBlob).toString('base64');
    const plaintextKeyHex = Buffer.from(response.Plaintext).toString('hex');

    console.log('\n✅ Data encryption key generated successfully!\n');
    
    console.log('━'.repeat(70));
    console.log('\n📋 Add these to your production environment variables:\n');
    
    console.log('# AWS KMS Key Management');
    console.log(`AWS_KMS_KEY_ID=${keyId}`);
    console.log(`ENCRYPTED_PHI_KEY=${encryptedKey}`);
    
    console.log('\n━'.repeat(70));
    
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('');
    console.log('1. The ENCRYPTED_PHI_KEY is encrypted with your KMS key');
    console.log('   It can only be decrypted by AWS KMS using the same key');
    console.log('');
    console.log('2. Never share or commit the plaintext key');
    console.log('   (The key below is shown only for verification)');
    console.log('');
    console.log('3. Store ENCRYPTED_PHI_KEY in your secrets manager:');
    console.log('   - AWS Secrets Manager');
    console.log('   - HashiCorp Vault');
    console.log('   - Vercel Environment Variables (encrypted)');
    console.log('');
    console.log('4. Enable key rotation in AWS KMS for automatic rotation');
    console.log('');
    
    // Show plaintext for verification (in a real scenario, this would be hidden)
    if (process.env.SHOW_PLAINTEXT === 'true') {
      console.log('━'.repeat(70));
      console.log('\n🔓 Plaintext key (for verification only - DO NOT SHARE):');
      console.log(`   ${plaintextKeyHex}`);
    }
    
    console.log('\n✨ Done! Your PHI encryption key is ready for production.\n');
    
  } catch (error) {
    console.error('\n❌ Failed to generate key:', error);
    
    if ((error as Error).name === 'CredentialsProviderError') {
      console.error('\n💡 Tip: Make sure your AWS credentials are configured:');
      console.error('   - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
      console.error('   - Or configure AWS CLI: aws configure');
      console.error('   - Or use IAM role (if running on AWS)');
    }
    
    if ((error as Error).name === 'AccessDeniedException') {
      console.error('\n💡 Tip: Check KMS key permissions:');
      console.error('   - Your IAM user/role needs kms:GenerateDataKey permission');
      console.error('   - The KMS key policy must allow access');
    }
    
    process.exit(1);
  }
}

main();
