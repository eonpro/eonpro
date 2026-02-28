/**
 * Example of protected patient API endpoint
 * Shows how to use the authentication middleware
 */

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { withProviderAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { buildPatientSearchIndex } from '@/lib/utils/search';

/**
 * GET /api/patients/protected
 * Protected endpoint - requires provider or admin authentication
 */
export const GET = withProviderAuth(async (req, user) => {
  try {
    // User is guaranteed to be authenticated and have provider/admin role
    logger.debug('Authenticated request', { userId: user.id, role: user.role });

    // Get patients based on user role
    // IMPORTANT: Use user.providerId (Provider table ID), NOT user.id (User table ID)
    const patients = await prisma.patient.findMany({
      where: (user.role === 'provider' && user.providerId
        ? { providerId: user.providerId } // Providers see only their patients
        : {}) as any, // Admins see all patients
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        dob: true,
        createdAt: true,
      },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({
      patients,
      meta: {
        count: patients.length,
        requestedBy: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('Error fetching protected patients:', error);
    return Response.json({ error: 'Failed to fetch patients' }, { status: 500 });
  }
});

/**
 * POST /api/patients/protected
 * Create a new patient - requires provider or admin authentication
 */
export const POST = withProviderAuth(async (req, user) => {
  try {
    const body = await req.json();

    // Validate required fields
    const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'dob'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    // Create patient with audit trail
    // IMPORTANT: Use user.providerId (Provider table ID), NOT user.id (User table ID)
    const patient = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Build search index from plain-text data before create
      const searchIndex = buildPatientSearchIndex({
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
      });

      // Whitelist fields to prevent mass assignment of privileged fields
      const newPatient = await tx.patient.create({
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone,
          dob: body.dob,
          gender: body.gender,
          address1: body.address1,
          address2: body.address2,
          city: body.city,
          state: body.state,
          zip: body.zip,
          searchIndex,
          createdById: user.id,
          providerId:
            user.role === 'provider' && user.providerId ? user.providerId : body.providerId,
        },
      });

      // Create audit log (actorId uses user.id, but providerId should use the actual provider ID)
      await tx.patientAudit.create({
        data: {
          patientId: newPatient.id,
          action: 'CREATE',
          actorEmail: user.email,
          diff: JSON.stringify(body),
        },
      });

      return newPatient;
    }, { timeout: 15000 });

    return Response.json({
      patient,
      message: 'Patient created successfully',
    });
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error creating patient:', error);

    if (error.code === 'P2002') {
      return Response.json({ error: 'Patient with this email already exists' }, { status: 400 });
    }

    return Response.json({ error: 'Failed to create patient' }, { status: 500 });
  }
});
