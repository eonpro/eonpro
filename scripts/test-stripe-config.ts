/**
 * Test script to verify Stripe configuration
 * Run with: npx ts-node scripts/test-stripe-config.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testStripeConfig() {
  console.log('='.repeat(60));
  console.log('STRIPE CONFIGURATION TEST');
  console.log('='.repeat(60));
  
  // Check environment variables
  console.log('\n1. Environment Variables:');
  console.log(`   STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? '✅ Set (' + process.env.STRIPE_SECRET_KEY.substring(0, 12) + '...)' : '❌ NOT SET'}`);
  console.log(`   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? '✅ Set' : '❌ NOT SET'}`);
  console.log(`   STRIPE_WEBHOOK_SECRET: ${process.env.STRIPE_WEBHOOK_SECRET ? '✅ Set' : '❌ NOT SET'}`);
  console.log(`   NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS: ${process.env.NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS || 'NOT SET'}`);
  
  // Test Stripe connection
  if (process.env.STRIPE_SECRET_KEY) {
    console.log('\n2. Testing Stripe Connection:');
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2025-11-17.clover',
      });
      
      const balance = await stripe.balance.retrieve();
      console.log('   ✅ Connection successful!');
      console.log(`   Available balance: ${balance.available.map((b: any) => `${b.amount / 100} ${b.currency.toUpperCase()}`).join(', ') || 'N/A'}`);
      
      // Check for products
      const products = await stripe.products.list({ limit: 5 });
      console.log(`   Products: ${products.data.length} found`);
      
      // Check for prices
      const prices = await stripe.prices.list({ limit: 10, active: true });
      console.log(`   Active prices: ${prices.data.length} found`);
      
      if (prices.data.length > 0) {
        console.log('\n   Sample prices:');
        prices.data.slice(0, 3).forEach((p: any) => {
          console.log(`     - ${p.id}: ${p.unit_amount ? '$' + (p.unit_amount / 100).toFixed(2) : 'N/A'} (${p.type})`);
        });
      }
      
    } catch (error: any) {
      console.log(`   ❌ Connection failed: ${error.message}`);
    }
  } else {
    console.log('\n2. Skipping Stripe connection test (no key)');
  }
  
  console.log('\n' + '='.repeat(60));
}

testStripeConfig().catch(console.error);
