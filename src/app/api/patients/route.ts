/**
 * Patients List Route
 * ===================
 *
 * API endpoints for patient list operations.
 * All handlers use the patient service layer for business logic.
 *
 * @module api/patients
 */

import { NextRequest } from 'next/server';
import { withClinicalAuth } from '@/lib/auth/middleware';
import { relaxedRateLimit, standardRateLimit } from '@/lib/rateLimit';
import { patientService, type UserContext, type ListPatientsOptions } from '@/domains/patient';
import { handleApiError } from '@/domains/shared/errors';

/**
 * GET /api/patients
 * List patients with filtering and pagination
 *
 * HIPAA CONSIDERATION: By default returns minimal PHI.
 * Use includeContact=true to get email/phone/address.
 *
 * Uses the patient service layer which handles:
 * - Clinic isolation (non-super-admin filtered by clinicId)
 * - PHI decryption
 * - Pagination and filtering
 *
 * Query params:
 * - limit: Max results (default 100, max 500)
 * - recent: Time filter ('24h', '7d', '30d')
 * - search: Search by name or patient ID
 * - source: Filter by source
 * - tags: Filter by tags (comma-separated)
 * - includeContact: Include email/phone/address (default: false)
 */
const getPatientsHandler = withClinicalAuth(async (req: NextRequest, user) => {
  try {
    const { searchParams } = new URL(req.url);

    // Parse query parameters
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
    const limit = isNaN(rawLimit) || rawLimit <= 0 ? 100 : Math.min(rawLimit, 500);

    // HIPAA: Only include contact info if explicitly requested
    const includeContact = searchParams.get('includeContact') === 'true';

    const options: ListPatientsOptions = {
      limit,
      recent: searchParams.get('recent') || undefined,
      search: searchParams.get('search') || undefined,
      source: searchParams.get('source') as ListPatientsOptions['source'] || undefined,
      tags: searchParams.get('tags')?.split(',').filter(Boolean) || undefined,
    };

    // Convert auth user to service UserContext
    const userContext: UserContext = {
      id: user.id,
      email: user.email,
      role: user.role as UserContext['role'],
      clinicId: user.clinicId,
      patientId: user.patientId,
    };

    // Use patient service - handles clinic isolation, PHI decryption
    const result = await patientService.listPatients(userContext, options);

    // Transform to dashboard-friendly format
    // HIPAA: Minimize PHI in list responses
    const patients = result.data.map((patient) => {
      // Base fields (minimal PHI)
      const baseData: Record<string, any> = {
        id: patient.id,
        patientId: patient.patientId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        gender: patient.gender,
        tags: patient.tags || [],
        source: patient.source,
        createdAt: patient.createdAt,
        clinicId: patient.clinicId,
        // Include clinic name for super admin
        clinicName: 'clinicName' in patient ? patient.clinicName : null,
      };

      // HIPAA: Only include contact info if explicitly requested
      if (includeContact) {
        const addressParts = [
          patient.address1,
          patient.address2,
          patient.city,
          patient.state,
          patient.zip,
        ].filter(Boolean);

        baseData.email = patient.email;
        baseData.phone = patient.phone;
        baseData.dateOfBirth = patient.dob;
        baseData.address = addressParts.join(', ');
      }

      return baseData;
    });

    return Response.json({
      patients,
      meta: {
        count: patients.length,
        total: result.total,
        hasMore: result.hasMore,
        accessedBy: user.email,
        role: user.role,
        filters: { limit, recent: options.recent },
        includeContact,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/patients' },
    });
  }
});

// Apply rate limiting to GET endpoint
export const GET = relaxedRateLimit(getPatientsHandler);

/**
 * POST /api/patients
 * Create a new patient
 *
 * Uses the patient service layer which handles:
 * - Input validation (with normalization)
 * - Clinic assignment (super_admin must specify, others use their clinic)
 * - PHI encryption
 * - Audit logging
 * - Duplicate email detection
 */
const createPatientHandler = withClinicalAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();

    // Convert auth user to service UserContext
    const userContext: UserContext = {
      id: user.id,
      email: user.email,
      role: user.role as UserContext['role'],
      clinicId: user.clinicId,
      patientId: user.patientId,
    };

    // Use patient service - handles validation, clinic assignment, PHI, audit
    const patient = await patientService.createPatient(body, userContext);

    return Response.json({
      patient,
      message: 'Patient created successfully',
    });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'POST /api/patients' },
    });
  }
});

// Apply rate limiting to POST endpoint
export const POST = standardRateLimit(createPatientHandler);
