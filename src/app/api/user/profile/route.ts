/**
 * User Profile API
 *
 * Handles user profile information retrieval and updates.
 * Works for all authenticated users. For patient users,
 * also syncs dateOfBirth and address to the Patient record.
 *
 * GET - Get current user's profile information (includes patient data for patients)
 * PATCH - Update profile information
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { decryptPatientPHI, decryptPHI, encryptPHI } from '@/lib/security/phi-encryption';
import { handleApiError } from '@/domains/shared/errors';
import { buildPatientSearchIndex } from '@/lib/utils/search';

const addressSchema = z.object({
  street: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip: z.string().max(20).optional(),
}).optional().nullable();

const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100).optional(),
  lastName: z.string().min(1, 'Last name is required').max(100).optional(),
  email: z.string().email('Invalid email address').max(255).optional(),
  phone: z.string().max(20).optional().nullable(),
  dateOfBirth: z.string().max(20).optional().nullable(),
  address: addressSchema,
  preferredLanguage: z.enum(['en', 'es']).optional(),
});

/**
 * GET /api/user/profile
 * Returns the current user's profile information
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        avatarUrl: true,
        status: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLogin: true,
        metadata: true,
        patientId: true,
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const metadata = (dbUser.metadata as Record<string, unknown>) || {};
    const preferredLanguage = (metadata.preferredLanguage as string) || 'en';

    let dateOfBirth: string | null = null;
    let address: { street: string; city: string; state: string; zip: string } | null = null;
    let patientPhone: string | null = null;

    if (dbUser.patientId) {
      const patient = await prisma.patient.findUnique({
        where: { id: dbUser.patientId },
        select: { dob: true, phone: true, address1: true, address2: true, city: true, state: true, zip: true },
      });
      if (patient) {
        const decrypted = decryptPatientPHI(
          patient as Record<string, unknown>,
          ['dob', 'phone', 'address1', 'address2', 'city', 'state', 'zip']
        );
        dateOfBirth = (decrypted.dob as string) || null;
        patientPhone = (decrypted.phone as string) || null;
        const street = [decrypted.address1, decrypted.address2].filter(Boolean).join(', ');
        if (street || decrypted.city || decrypted.state || decrypted.zip) {
          address = {
            street: street || '',
            city: (decrypted.city as string) || '',
            state: (decrypted.state as string) || '',
            zip: (decrypted.zip as string) || '',
          };
        }
      }
    }

    return NextResponse.json({
      id: dbUser.id,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      email: dbUser.email,
      phone: dbUser.phone || patientPhone || '',
      role: dbUser.role,
      avatarUrl: dbUser.avatarUrl,
      status: dbUser.status,
      emailVerified: dbUser.emailVerified,
      twoFactorEnabled: dbUser.twoFactorEnabled,
      createdAt: dbUser.createdAt,
      lastLogin: dbUser.lastLogin,
      preferredLanguage: preferredLanguage === 'es' ? 'es' : 'en',
      clinic: dbUser.clinic,
      dateOfBirth,
      address,
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/user/profile' });
  }
}

/**
 * PATCH /api/user/profile
 * Update user profile information
 */
async function handlePatch(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();

    const parseResult = updateProfileSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { firstName, lastName, email, phone, dateOfBirth, address, preferredLanguage } = parseResult.data;

    const userUpdateData: Record<string, unknown> = {};
    const patientUpdateData: Record<string, unknown> = {};
    const updatedFields: string[] = [];

    if (firstName !== undefined) {
      userUpdateData.firstName = firstName;
      patientUpdateData.firstName = encryptPHI(firstName);
      updatedFields.push('firstName');
    }
    if (lastName !== undefined) {
      userUpdateData.lastName = lastName;
      patientUpdateData.lastName = encryptPHI(lastName);
      updatedFields.push('lastName');
    }
    if (email !== undefined) {
      const existingUser = await prisma.user.findFirst({
        where: { email: email.toLowerCase(), id: { not: user.id } },
        select: { id: true },
      });
      if (existingUser) {
        return NextResponse.json({ error: 'Email address is already in use' }, { status: 409 });
      }
      userUpdateData.email = email.toLowerCase();
      patientUpdateData.email = encryptPHI(email.toLowerCase());
      updatedFields.push('email');
    }
    if (phone !== undefined) {
      userUpdateData.phone = phone || null;
      patientUpdateData.phone = phone ? encryptPHI(phone) : '';
      updatedFields.push('phone');
    }
    if (dateOfBirth !== undefined) {
      if (dateOfBirth) {
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) {
          return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
        }
        const now = new Date();
        const age = now.getFullYear() - dob.getFullYear();
        if (age < 0 || age > 150) {
          return NextResponse.json({ error: 'Date of birth is out of valid range' }, { status: 400 });
        }
      }
      patientUpdateData.dob = dateOfBirth ? encryptPHI(dateOfBirth) : '';
      updatedFields.push('dateOfBirth');
    }
    if (address !== undefined && address !== null) {
      if (address.street !== undefined) {
        patientUpdateData.address1 = address.street ? encryptPHI(address.street) : '';
      }
      if (address.city !== undefined) {
        patientUpdateData.city = address.city ? encryptPHI(address.city) : '';
      }
      if (address.state !== undefined) {
        patientUpdateData.state = address.state ? encryptPHI(address.state) : '';
      }
      if (address.zip !== undefined) {
        patientUpdateData.zip = address.zip ? encryptPHI(address.zip) : '';
      }
      updatedFields.push('address');
    }
    if (preferredLanguage !== undefined) {
      const current = await prisma.user.findUnique({
        where: { id: user.id },
        select: { metadata: true },
      });
      const metadata = (current?.metadata as Record<string, unknown>) || {};
      userUpdateData.metadata = { ...metadata, preferredLanguage };
      updatedFields.push('preferredLanguage');
    }

    if (updatedFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { patientId: true },
    });

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdateData).length > 0) {
        await tx.user.update({ where: { id: user.id }, data: userUpdateData });
      }
      if (Object.keys(patientUpdateData).length > 0 && dbUser?.patientId) {
        const phiChanged = firstName !== undefined || lastName !== undefined ||
          email !== undefined || phone !== undefined;

        if (phiChanged) {
          const existing = await tx.patient.findUnique({
            where: { id: dbUser.patientId },
            select: { firstName: true, lastName: true, email: true, phone: true, patientId: true },
          });

          const safeDecrypt = (v: unknown): string => {
            if (v == null || v === '') return '';
            try { return decryptPHI(String(v)) ?? ''; } catch { return String(v); }
          };

          patientUpdateData.searchIndex = buildPatientSearchIndex({
            firstName: firstName ?? safeDecrypt(existing?.firstName),
            lastName: lastName ?? safeDecrypt(existing?.lastName),
            email: email ?? safeDecrypt(existing?.email),
            phone: phone ?? safeDecrypt(existing?.phone),
            patientId: existing?.patientId ?? null,
          });
        }

        await tx.patient.update({ where: { id: dbUser.patientId }, data: patientUpdateData });
      }
    }, { timeout: 10000 });

    logger.info('[User Profile] Updated', {
      userId: user.id,
      updatedFields,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: 'PATCH /api/user/profile' });
  }
}

// All authenticated users can manage their profile
export const GET = withAuth(handleGet);
export const PATCH = withAuth(handlePatch);
