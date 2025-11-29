/**
 * Example of protected patient API endpoint
 * Shows how to use the authentication middleware
 */

import { NextRequest } from 'next/server';
import { withProviderAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

/**
 * GET /api/patients/protected
 * Protected endpoint - requires provider or admin authentication
 */
export const GET = withProviderAuth(async (req, user) => {
  try {
    // User is guaranteed to be authenticated and have provider/admin role
    logger.debug(`Authenticated request from user: ${user.email} (${user.role})`);

    // Get patients based on user role
    const patients = await prisma.patient.findMany({
      where: (user.role === 'provider' 
        ? { providerId: user.id } // Providers see only their patients
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
      }
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error fetching protected patients:', error);
    return Response.json(
      { error: 'Failed to fetch patients' },
      { status: 500 }
    );
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
        return Response.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Create patient with audit trail
    const patient = await prisma.$transaction(async (tx: any) => {
      // Create patient
      const newPatient = await tx.patient.create({
        data: {
          ...body,
          createdById: user.id,
          providerId: user.role === 'provider' ? user.id : body.providerId,
        },
      });

      // Create audit log
      await tx.patientAudit.create({
        data: {
          patientId: newPatient.id,
          action: 'CREATE',
          providerId: user.id,
          actorEmail: user.email,
          diff: JSON.stringify(body),
        },
      });

      return newPatient;
    });

    return Response.json({
      patient,
      message: 'Patient created successfully',
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error creating patient:', error);
    
    if (error.code === 'P2002') {
      return Response.json(
        { error: 'Patient with this email already exists' },
        { status: 400 }
      );
    }

    return Response.json(
      { error: 'Failed to create patient' },
      { status: 500 }
    );
  }
});
