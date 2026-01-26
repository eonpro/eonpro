/**
 * Affiliate Application API
 * 
 * Public endpoint for submitting affiliate applications.
 * Resolves clinic from request domain.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Validation schema for application
const socialProfileSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'linkedin', 'other']),
  url: z.string().url('Please enter a valid URL'),
  handle: z.string().optional(),
});

const applicationSchema = z.object({
  fullName: z.string().min(2, 'Full name is required').max(100),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().min(10, 'Please enter a valid phone number').max(20),
  addressLine1: z.string().min(1, 'Address is required').max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(2, 'State is required').max(50),
  zipCode: z.string().min(5, 'ZIP code is required').max(20),
  country: z.string().default('US'),
  socialProfiles: z.array(socialProfileSchema).min(1, 'At least one social media profile is required'),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  audienceSize: z.string().optional(),
  promotionPlan: z.string().max(1000).optional(),
});

// Rate limit: 3 applications per email per day
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = applicationSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const data = validationResult.data;

    // Resolve clinic from domain
    const domain = request.headers.get('host') || '';
    const clinic = await resolveClinicFromDomain(domain);

    if (!clinic) {
      logger.warn('[AffiliateApply] No clinic found for domain', { domain });
      return NextResponse.json(
        { error: 'Unable to determine clinic. Please contact support.' },
        { status: 400 }
      );
    }

    // Rate limiting by email
    const now = Date.now();
    const rateKey = `${clinic.id}:${data.email.toLowerCase()}`;
    const rateLimit = rateLimitMap.get(rateKey);

    if (rateLimit && rateLimit.resetAt > now && rateLimit.count >= 3) {
      return NextResponse.json(
        { error: 'Too many applications from this email. Please try again tomorrow.' },
        { status: 429 }
      );
    }

    // Update rate limit
    if (!rateLimit || rateLimit.resetAt <= now) {
      rateLimitMap.set(rateKey, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    } else {
      rateLimit.count++;
    }

    // Normalize phone
    const normalizedPhone = data.phone.replace(/\D/g, '');

    // Check for existing application (same email or phone, pending)
    const existingApplication = await prisma.affiliateApplication.findFirst({
      where: {
        clinicId: clinic.id,
        status: 'PENDING',
        OR: [
          { email: data.email.toLowerCase() },
          { phone: normalizedPhone },
        ],
      },
    });

    if (existingApplication) {
      return NextResponse.json(
        { error: 'An application with this email or phone is already pending review.' },
        { status: 409 }
      );
    }

    // Check if already an active affiliate
    const existingAffiliate = await prisma.affiliate.findFirst({
      where: {
        clinicId: clinic.id,
        user: {
          OR: [
            { email: data.email.toLowerCase() },
            { phone: { endsWith: normalizedPhone.slice(-10) } },
          ],
        },
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
    });

    if (existingAffiliate) {
      return NextResponse.json(
        { error: 'You are already registered as an affiliate. Please log in instead.' },
        { status: 409 }
      );
    }

    // Create application
    const application = await prisma.affiliateApplication.create({
      data: {
        clinicId: clinic.id,
        fullName: data.fullName.trim(),
        email: data.email.toLowerCase().trim(),
        phone: normalizedPhone.startsWith('1') ? `+${normalizedPhone}` : `+1${normalizedPhone}`,
        addressLine1: data.addressLine1.trim(),
        addressLine2: data.addressLine2?.trim() || null,
        city: data.city.trim(),
        state: data.state.toUpperCase().trim(),
        zipCode: data.zipCode.trim(),
        country: data.country,
        socialProfiles: data.socialProfiles,
        website: data.website || null,
        audienceSize: data.audienceSize || null,
        promotionPlan: data.promotionPlan?.trim() || null,
      },
    });

    logger.info('[AffiliateApply] Application submitted', {
      applicationId: application.id,
      clinicId: clinic.id,
      email: data.email,
    });

    // TODO: Send notification email to admin

    return NextResponse.json({
      success: true,
      message: 'Your application has been submitted successfully. We will review it and get back to you soon.',
      applicationId: application.id,
    });
  } catch (error) {
    logger.error('[AffiliateApply] Error submitting application', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });

    // Return more specific error in development
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: 'Failed to submit application. Please try again.',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * Resolve clinic from domain string
 */
async function resolveClinicFromDomain(domain: string) {
  const normalizedDomain = domain.split(':')[0].toLowerCase();

  // Try custom domain first
  let clinic = await prisma.clinic.findFirst({
    where: {
      customDomain: normalizedDomain,
      status: 'ACTIVE',
    },
    select: { id: true, name: true },
  });

  if (clinic) return clinic;

  // Extract subdomain
  const parts = normalizedDomain.split('.');
  const skipSubdomains = ['www', 'app', 'api', 'admin', 'staging', 'portal'];

  // For localhost
  if (normalizedDomain.includes('localhost')) {
    if (parts.length >= 2 && !skipSubdomains.includes(parts[0])) {
      clinic = await prisma.clinic.findFirst({
        where: { subdomain: parts[0], status: 'ACTIVE' },
        select: { id: true, name: true },
      });
    }
  }
  // For eonpro.io subdomains
  else if (normalizedDomain.endsWith('.eonpro.io') && parts.length >= 3) {
    if (!skipSubdomains.includes(parts[0])) {
      clinic = await prisma.clinic.findFirst({
        where: { subdomain: parts[0], status: 'ACTIVE' },
        select: { id: true, name: true },
      });
    }
  }
  // For other subdomains
  else if (parts.length >= 3 && !skipSubdomains.includes(parts[0])) {
    clinic = await prisma.clinic.findFirst({
      where: { subdomain: parts[0], status: 'ACTIVE' },
      select: { id: true, name: true },
    });
  }

  return clinic;
}
