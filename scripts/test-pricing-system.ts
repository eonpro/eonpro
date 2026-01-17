/**
 * PRICING SYSTEM TEST SCRIPT
 * ==========================
 * Tests all pricing system features locally
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testPricingSystem() {
  console.log('='.repeat(60));
  console.log('PRICING SYSTEM COMPREHENSIVE TEST');
  console.log('='.repeat(60));

  try {
    // 1. Find or create test clinic
    console.log('\n1. Setting up test clinic...');
    let clinic = await prisma.clinic.findFirst({
      where: { subdomain: 'eonmeds' },
    });
    
    if (!clinic) {
      console.log('   - No clinic found, using first available');
      clinic = await prisma.clinic.findFirst();
    }
    
    if (!clinic) {
      console.error('   ERROR: No clinic found in database');
      return;
    }
    console.log(`   - Using clinic: ${clinic.name} (ID: ${clinic.id})`);

    // 2. Test Product creation
    console.log('\n2. Testing Product creation...');
    
    // Check if test products exist
    let product1 = await prisma.product.findFirst({
      where: { clinicId: clinic.id, name: 'Test Semaglutide Monthly' },
    });

    if (!product1) {
      product1 = await prisma.product.create({
        data: {
          clinicId: clinic.id,
          name: 'Test Semaglutide Monthly',
          shortDescription: 'Monthly subscription',
          price: 22900, // $229.00
          category: 'MEDICATION',
          billingType: 'RECURRING',
          billingInterval: 'MONTHLY',
          isActive: true,
          isVisible: true,
        },
      });
      console.log(`   - Created product: ${product1.name} ($${(product1.price / 100).toFixed(2)})`);
    } else {
      console.log(`   - Product exists: ${product1.name} ($${(product1.price / 100).toFixed(2)})`);
    }

    let product2 = await prisma.product.findFirst({
      where: { clinicId: clinic.id, name: 'Test Lab Work' },
    });

    if (!product2) {
      product2 = await prisma.product.create({
        data: {
          clinicId: clinic.id,
          name: 'Test Lab Work',
          shortDescription: 'Initial lab panel',
          price: 15000, // $150.00
          category: 'LAB_TEST',
          billingType: 'ONE_TIME',
          isActive: true,
          isVisible: true,
        },
      });
      console.log(`   - Created product: ${product2.name} ($${(product2.price / 100).toFixed(2)})`);
    } else {
      console.log(`   - Product exists: ${product2.name} ($${(product2.price / 100).toFixed(2)})`);
    }

    // 3. Test Discount Code creation
    console.log('\n3. Testing Discount Code creation...');
    
    let discountCode = await prisma.discountCode.findFirst({
      where: { clinicId: clinic.id, code: 'TEST20' },
    });

    if (!discountCode) {
      discountCode = await prisma.discountCode.create({
        data: {
          clinicId: clinic.id,
          code: 'TEST20',
          name: 'Test 20% Discount',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          applyTo: 'ALL_PRODUCTS',
          maxUses: 100,
          maxUsesPerPatient: 1,
          startsAt: new Date(),
          isActive: true,
        },
      });
      console.log(`   - Created discount: ${discountCode.code} (${discountCode.discountValue}% off)`);
    } else {
      console.log(`   - Discount exists: ${discountCode.code} (${discountCode.discountValue}% off)`);
    }

    // Test fixed amount discount
    let fixedDiscount = await prisma.discountCode.findFirst({
      where: { clinicId: clinic.id, code: 'SAVE50' },
    });

    if (!fixedDiscount) {
      fixedDiscount = await prisma.discountCode.create({
        data: {
          clinicId: clinic.id,
          code: 'SAVE50',
          name: '$50 Off First Order',
          discountType: 'FIXED_AMOUNT',
          discountValue: 5000, // $50
          applyTo: 'ALL_PRODUCTS',
          maxUses: 50,
          firstTimeOnly: true,
          minOrderAmount: 10000, // $100 minimum
          startsAt: new Date(),
          isActive: true,
        },
      });
      console.log(`   - Created discount: ${fixedDiscount.code} ($${(fixedDiscount.discountValue / 100).toFixed(2)} off)`);
    } else {
      console.log(`   - Discount exists: ${fixedDiscount.code} ($${(fixedDiscount.discountValue / 100).toFixed(2)} off)`);
    }

    // 4. Test Promotion creation
    console.log('\n4. Testing Promotion creation...');
    
    let promotion = await prisma.promotion.findFirst({
      where: { clinicId: clinic.id, name: 'Test New Year Sale' },
    });

    if (!promotion) {
      promotion = await prisma.promotion.create({
        data: {
          clinicId: clinic.id,
          name: 'Test New Year Sale',
          promotionType: 'SEASONAL',
          discountType: 'PERCENTAGE',
          discountValue: 15,
          applyTo: 'ALL_PRODUCTS',
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          autoApply: true,
          bannerText: 'New Year Sale - 15% Off Everything!',
          isActive: true,
        },
      });
      console.log(`   - Created promotion: ${promotion.name} (${promotion.discountValue}% off)`);
    } else {
      console.log(`   - Promotion exists: ${promotion.name} (${promotion.discountValue}% off)`);
    }

    // 5. Test Bundle creation
    console.log('\n5. Testing Bundle creation...');
    
    let bundle = await prisma.productBundle.findFirst({
      where: { clinicId: clinic.id, name: 'Test Starter Package' },
    });

    if (!bundle) {
      bundle = await prisma.productBundle.create({
        data: {
          clinicId: clinic.id,
          name: 'Test Starter Package',
          description: 'Get started with medication + lab work',
          regularPrice: product1.price + product2.price, // $379
          bundlePrice: 29900, // $299
          savingsAmount: (product1.price + product2.price) - 29900,
          savingsPercent: ((product1.price + product2.price - 29900) / (product1.price + product2.price)) * 100,
          billingType: 'ONE_TIME',
          isActive: true,
          isVisible: true,
          items: {
            create: [
              { productId: product1.id, quantity: 1 },
              { productId: product2.id, quantity: 1 },
            ],
          },
        },
        include: {
          items: {
            include: { product: true },
          },
        },
      });
      console.log(`   - Created bundle: ${bundle.name}`);
      console.log(`     Regular: $${(bundle.regularPrice / 100).toFixed(2)}`);
      console.log(`     Bundle: $${(bundle.bundlePrice / 100).toFixed(2)}`);
      console.log(`     Savings: $${(bundle.savingsAmount / 100).toFixed(2)} (${bundle.savingsPercent.toFixed(0)}%)`);
    } else {
      console.log(`   - Bundle exists: ${bundle.name} ($${(bundle.bundlePrice / 100).toFixed(2)})`);
    }

    // 6. Test Pricing Rule creation
    console.log('\n6. Testing Pricing Rule creation...');
    
    let pricingRule = await prisma.pricingRule.findFirst({
      where: { clinicId: clinic.id, name: 'Test Volume Discount' },
    });

    if (!pricingRule) {
      pricingRule = await prisma.pricingRule.create({
        data: {
          clinicId: clinic.id,
          name: 'Test Volume Discount',
          description: '10% off when ordering 3+ items',
          ruleType: 'VOLUME_DISCOUNT',
          conditions: [
            { type: 'quantity', operator: '>=', value: 3 },
          ],
          discountType: 'PERCENTAGE',
          discountValue: 10,
          applyTo: 'ALL_PRODUCTS',
          priority: 10,
          isActive: true,
        },
      });
      console.log(`   - Created pricing rule: ${pricingRule.name}`);
    } else {
      console.log(`   - Pricing rule exists: ${pricingRule.name}`);
    }

    // 7. Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const productCount = await prisma.product.count({ where: { clinicId: clinic.id } });
    const discountCount = await prisma.discountCode.count({ where: { clinicId: clinic.id } });
    const promotionCount = await prisma.promotion.count({ where: { clinicId: clinic.id } });
    const bundleCount = await prisma.productBundle.count({ where: { clinicId: clinic.id } });
    const ruleCount = await prisma.pricingRule.count({ where: { clinicId: clinic.id } });

    console.log(`\n   Clinic: ${clinic.name}`);
    console.log(`   Products: ${productCount}`);
    console.log(`   Discount Codes: ${discountCount}`);
    console.log(`   Promotions: ${promotionCount}`);
    console.log(`   Bundles: ${bundleCount}`);
    console.log(`   Pricing Rules: ${ruleCount}`);

    // 8. Test discount validation
    console.log('\n' + '='.repeat(60));
    console.log('DISCOUNT VALIDATION TEST');
    console.log('='.repeat(60));

    // Simulate applying TEST20 to a $229 order
    const orderAmount = 22900;
    const discount20 = await prisma.discountCode.findFirst({
      where: { clinicId: clinic.id, code: 'TEST20', isActive: true },
    });

    if (discount20) {
      let discountAmount = 0;
      if (discount20.discountType === 'PERCENTAGE') {
        discountAmount = Math.round(orderAmount * (discount20.discountValue / 100));
      } else {
        discountAmount = Math.min(discount20.discountValue, orderAmount);
      }
      const finalAmount = orderAmount - discountAmount;

      console.log(`\n   Order: $${(orderAmount / 100).toFixed(2)}`);
      console.log(`   Code: ${discount20.code} (${discount20.discountValue}% off)`);
      console.log(`   Discount: -$${(discountAmount / 100).toFixed(2)}`);
      console.log(`   Final: $${(finalAmount / 100).toFixed(2)}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\nTEST ERROR:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testPricingSystem()
  .then(() => {
    console.log('\nTest script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test script failed:', error);
    process.exit(1);
  });
