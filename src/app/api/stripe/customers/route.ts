/**
 * STRIPE CUSTOMERS API
 * 
 * GET /api/stripe/customers - List all customers with analytics
 * 
 * Provides:
 * - Customer list with spending data
 * - Lifetime value (LTV)
 * - Payment method statistics
 * - Subscription status
 * 
 * PROTECTED: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, formatCurrency } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

async function getCustomersHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can view customer data
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }
    
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const startingAfter = searchParams.get('starting_after') || undefined;
    const email = searchParams.get('email') || undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeCharges = searchParams.get('includeCharges') !== 'false';
    const includeSubscriptions = searchParams.get('includeSubscriptions') !== 'false';
    
    // Build date filter
    const createdFilter: Stripe.RangeQueryParam | undefined = 
      startDate || endDate ? {
        ...(startDate && { gte: Math.floor(new Date(startDate).getTime() / 1000) }),
        ...(endDate && { lte: Math.floor(new Date(endDate).getTime() / 1000) }),
      } : undefined;
    
    // Fetch customers
    const customerParams: Stripe.CustomerListParams = {
      limit,
      ...(startingAfter && { starting_after: startingAfter }),
      ...(email && { email }),
      ...(createdFilter && { created: createdFilter }),
      expand: ['data.default_source'],
    };
    
    const customers = await stripe.customers.list(customerParams);
    
    // Process customers with additional data
    let totalLifetimeValue = 0;
    let totalCustomers = customers.data.length;
    let customersWithPaymentMethod = 0;
    let customersWithSubscription = 0;
    
    const formattedCustomers = await Promise.all(
      customers.data.map(async (customer) => {
        let charges: any[] = [];
        let totalSpent = 0;
        let chargeCount = 0;
        let subscriptions: any[] = [];
        
        // Get customer's charges
        if (includeCharges) {
          try {
            const customerCharges = await stripe.charges.list({
              customer: customer.id,
              limit: 100,
            });
            
            charges = customerCharges.data.filter(c => c.status === 'succeeded');
            totalSpent = charges.reduce((sum, c) => sum + c.amount, 0);
            chargeCount = charges.length;
            totalLifetimeValue += totalSpent;
          } catch (e) {
            // Charges might fail for some customers
          }
        }
        
        // Get customer's subscriptions
        if (includeSubscriptions) {
          try {
            const customerSubs = await stripe.subscriptions.list({
              customer: customer.id,
              limit: 10,
            });
            
            subscriptions = customerSubs.data.map(sub => ({
              id: sub.id,
              status: sub.status,
              currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              items: sub.items.data.map(item => ({
                priceId: item.price.id,
                productId: typeof item.price.product === 'string' ? item.price.product : item.price.product?.id,
                quantity: item.quantity,
              })),
            }));
            
            if (subscriptions.some(s => s.status === 'active')) {
              customersWithSubscription++;
            }
          } catch (e) {
            // Subscriptions might fail
          }
        }
        
        // Check for payment methods
        const hasPaymentMethod = !!customer.default_source || !!customer.invoice_settings?.default_payment_method;
        if (hasPaymentMethod) {
          customersWithPaymentMethod++;
        }
        
        return {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          description: customer.description,
          created: customer.created,
          createdAt: new Date(customer.created * 1000).toISOString(),
          metadata: customer.metadata,
          // Linked patient ID from metadata
          patientId: customer.metadata?.patientId || null,
          // Address
          address: customer.address ? {
            city: customer.address.city,
            state: customer.address.state,
            country: customer.address.country,
            postalCode: customer.address.postal_code,
          } : null,
          // Payment info
          hasPaymentMethod,
          defaultPaymentMethod: customer.invoice_settings?.default_payment_method || null,
          currency: customer.currency?.toUpperCase() || 'USD',
          balance: customer.balance,
          balanceFormatted: formatCurrency(customer.balance),
          delinquent: customer.delinquent,
          // Spending analytics
          analytics: {
            totalSpent,
            totalSpentFormatted: formatCurrency(totalSpent),
            chargeCount,
            averageOrderValue: chargeCount > 0 ? Math.round(totalSpent / chargeCount) : 0,
            averageOrderValueFormatted: chargeCount > 0 ? formatCurrency(Math.round(totalSpent / chargeCount)) : '$0.00',
            firstCharge: charges.length > 0 ? new Date(charges[charges.length - 1].created * 1000).toISOString() : null,
            lastCharge: charges.length > 0 ? new Date(charges[0].created * 1000).toISOString() : null,
          },
          subscriptions,
          activeSubscriptionCount: subscriptions.filter(s => s.status === 'active').length,
          // Tax info
          taxExempt: customer.tax_exempt,
          taxIds: customer.tax_ids?.data?.map(t => ({
            type: t.type,
            value: t.value,
          })) || [],
        };
      })
    );
    
    // Summary statistics
    const summary = {
      totalCustomers,
      customersWithPaymentMethod,
      customersWithSubscription,
      totalLifetimeValue,
      totalLifetimeValueFormatted: formatCurrency(totalLifetimeValue),
      averageLTV: totalCustomers > 0 ? Math.round(totalLifetimeValue / totalCustomers) : 0,
      averageLTVFormatted: totalCustomers > 0 ? formatCurrency(Math.round(totalLifetimeValue / totalCustomers)) : '$0.00',
      paymentMethodRate: totalCustomers > 0 
        ? ((customersWithPaymentMethod / totalCustomers) * 100).toFixed(1) + '%'
        : '0%',
      subscriptionRate: totalCustomers > 0
        ? ((customersWithSubscription / totalCustomers) * 100).toFixed(1) + '%'
        : '0%',
    };
    
    logger.info('[STRIPE CUSTOMERS] Retrieved customers', {
      count: formattedCustomers.length,
      totalLTV: formatCurrency(totalLifetimeValue),
    });
    
    return NextResponse.json({
      success: true,
      customers: formattedCustomers,
      summary,
      pagination: {
        hasMore: customers.has_more,
        limit,
        ...(formattedCustomers.length > 0 && { lastId: formattedCustomers[formattedCustomers.length - 1].id }),
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    logger.error('[STRIPE CUSTOMERS] Error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch customers' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getCustomersHandler);
