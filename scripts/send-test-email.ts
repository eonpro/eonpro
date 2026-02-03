/**
 * Test Email Script
 * 
 * Sends a test email to verify the email service is working correctly.
 * 
 * Usage: npx ts-node scripts/send-test-email.ts
 */

import { sendEmail, sendTemplatedEmail, EmailTemplate, getEmailServiceStatus } from '../src/lib/email';

async function main() {
  const recipient = process.argv[2] || 'italo@eonmeds.com';
  
  console.log('📧 Email Service Test');
  console.log('=====================');
  
  // Check service status
  const status = getEmailServiceStatus();
  console.log(`\nService Status:`);
  console.log(`  Provider: ${status.provider}`);
  console.log(`  Mode: ${status.mode}`);
  console.log(`  Configured: ${status.configured}`);
  
  console.log(`\nSending test email to: ${recipient}`);
  
  // Send a simple test email
  const result = await sendEmail({
    to: recipient,
    subject: 'Test Email from Lifefile Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Test Email</h1>
        <p>This is a test email from the Lifefile Platform email service.</p>
        <p>If you're seeing this, the email service is working correctly!</p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
        <p style="color: #6B7280; font-size: 14px;">
          Sent at: ${new Date().toISOString()}<br>
          Mode: ${status.mode}
        </p>
      </div>
    `,
    text: `Test Email from Lifefile Platform\n\nThis is a test email. If you're seeing this, the email service is working correctly!\n\nSent at: ${new Date().toISOString()}`,
    sourceType: 'manual',
    sourceId: `test-${Date.now()}`,
  });
  
  if (result.success) {
    console.log(`\n✅ Email sent successfully!`);
    console.log(`   Message ID: ${result.messageId}`);
  } else {
    console.log(`\n❌ Email failed to send`);
    console.log(`   Error: ${result.error}`);
  }
}

main().catch(console.error);
