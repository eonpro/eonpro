/**
 * STRIPE EVENTS API
 * 
 * GET /api/stripe/events - List all Stripe events/activity log
 * 
 * Provides:
 * - Complete activity history
 * - Event filtering by type
 * - Debugging information
 * - Webhook delivery status
 * 
 * PROTECTED: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// Event categories for filtering
const EVENT_CATEGORIES = {
  payments: [
    'payment_intent.created',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'charge.succeeded',
    'charge.failed',
    'charge.refunded',
    'charge.dispute.created',
  ],
  invoices: [
    'invoice.created',
    'invoice.finalized',
    'invoice.paid',
    'invoice.payment_failed',
    'invoice.voided',
    'invoice.marked_uncollectible',
    'invoice.sent',
  ],
  subscriptions: [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.trial_will_end',
    'customer.subscription.paused',
    'customer.subscription.resumed',
  ],
  customers: [
    'customer.created',
    'customer.updated',
    'customer.deleted',
    'customer.source.created',
    'customer.source.updated',
  ],
  payouts: [
    'payout.created',
    'payout.paid',
    'payout.failed',
    'payout.canceled',
  ],
  disputes: [
    'charge.dispute.created',
    'charge.dispute.updated',
    'charge.dispute.closed',
    'charge.dispute.funds_withdrawn',
    'charge.dispute.funds_reinstated',
  ],
};

async function getEventsHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can view Stripe events
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }
    
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const startingAfter = searchParams.get('starting_after') || undefined;
    const type = searchParams.get('type') || undefined;
    const category = searchParams.get('category') as keyof typeof EVENT_CATEGORIES | undefined;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const deliverySuccess = searchParams.get('delivery_success');
    
    // Build filters
    const createdFilter: Stripe.RangeQueryParam | undefined = 
      startDate || endDate ? {
        ...(startDate && { gte: Math.floor(new Date(startDate).getTime() / 1000) }),
        ...(endDate && { lte: Math.floor(new Date(endDate).getTime() / 1000) }),
      } : undefined;
    
    // Get types from category if provided
    let types: string[] | undefined;
    if (category && EVENT_CATEGORIES[category]) {
      types = EVENT_CATEGORIES[category];
    } else if (type) {
      types = [type];
    }
    
    // Fetch events
    const eventParams: Stripe.EventListParams = {
      limit,
      ...(startingAfter && { starting_after: startingAfter }),
      ...(types && { types: types as Stripe.EventListParams.Type[] }),
      ...(createdFilter && { created: createdFilter }),
      ...(deliverySuccess !== null && { delivery_success: deliverySuccess === 'true' }),
    };
    
    const events = await stripe.events.list(eventParams);
    
    // Process events
    const typeBreakdown: Record<string, number> = {};
    
    const formattedEvents = events.data.map(event => {
      typeBreakdown[event.type] = (typeBreakdown[event.type] || 0) + 1;
      
      // Extract key info from event data
      const data = event.data.object as any;
      let summary = '';
      let amount = null;
      let customerId = null;
      let invoiceId = null;
      
      // Build summary based on event type
      if (event.type.startsWith('payment_intent')) {
        amount = data.amount;
        customerId = data.customer;
        summary = `Payment of ${formatAmount(data.amount, data.currency)} - ${data.status}`;
      } else if (event.type.startsWith('invoice')) {
        amount = data.amount_due || data.amount_paid;
        customerId = data.customer;
        invoiceId = data.id;
        summary = `Invoice ${data.number || data.id} - ${data.status}`;
      } else if (event.type.startsWith('customer.subscription')) {
        customerId = data.customer;
        summary = `Subscription ${data.id} - ${data.status}`;
      } else if (event.type.startsWith('charge')) {
        amount = data.amount;
        customerId = data.customer;
        summary = `Charge of ${formatAmount(data.amount, data.currency)} - ${data.status}`;
      } else if (event.type.startsWith('payout')) {
        amount = data.amount;
        summary = `Payout of ${formatAmount(data.amount, data.currency)} - ${data.status}`;
      } else if (event.type.startsWith('customer')) {
        customerId = data.id;
        summary = `Customer ${data.email || data.id}`;
      }
      
      return {
        id: event.id,
        type: event.type,
        typeCategory: getEventCategory(event.type),
        created: event.created,
        createdAt: new Date(event.created * 1000).toISOString(),
        apiVersion: event.api_version,
        livemode: event.livemode,
        pendingWebhooks: event.pending_webhooks,
        request: event.request ? {
          id: event.request.id,
          idempotencyKey: event.request.idempotency_key,
        } : null,
        summary,
        amount,
        amountFormatted: amount ? formatAmount(amount, data.currency || 'usd') : null,
        customerId,
        invoiceId,
        // Include relevant object ID
        objectId: data.id,
        objectType: data.object,
      };
    });
    
    // Summary statistics
    const summary = {
      totalEvents: formattedEvents.length,
      byType: Object.entries(typeBreakdown)
        .map(([type, count]) => ({
          type,
          category: getEventCategory(type),
          count,
        }))
        .sort((a, b) => b.count - a.count),
      byCategory: Object.keys(EVENT_CATEGORIES).map(cat => ({
        category: cat,
        count: formattedEvents.filter(e => e.typeCategory === cat).length,
      })),
      availableCategories: Object.keys(EVENT_CATEGORIES),
    };
    
    logger.info('[STRIPE EVENTS] Retrieved events', {
      count: formattedEvents.length,
    });
    
    return NextResponse.json({
      success: true,
      events: formattedEvents,
      summary,
      pagination: {
        hasMore: events.has_more,
        limit,
        ...(formattedEvents.length > 0 && { lastId: formattedEvents[formattedEvents.length - 1].id }),
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    logger.error('[STRIPE EVENTS] Error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch events' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getEventsHandler);

function getEventCategory(type: string): string {
  for (const [category, types] of Object.entries(EVENT_CATEGORIES)) {
    if (types.some(t => type.startsWith(t.split('.')[0]))) {
      return category;
    }
  }
  return 'other';
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
