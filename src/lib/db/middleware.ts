/**
 * Prisma Middleware for Automatic Data Filtering
 * Implements row-level security based on user context
 */

import { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth/session';
import { logger } from '@/lib/logger';

/**
 * Creates Prisma middleware for automatic data filtering based on user role
 * This ensures users can only access data they're authorized to see
 */
export function createSecurityMiddleware(): any {
  return async (params, next) => {
    // Get current user from async context (requires AsyncLocalStorage)
    const user = await getCurrentUser();
    
    if (!user) {
      // No user context, proceed without filtering (for system operations)
      return next(params);
    }

    // Apply filtering based on model and user role
    switch (params.model) {
      case 'Patient':
        params = await filterPatientAccess(params, user);
        break;
      
      case 'Order':
        params = await filterOrderAccess(params, user);
        break;
      
      case 'SOAPNote':
        params = await filterSOAPNoteAccess(params, user);
        break;
      
      case 'Provider':
        params = await filterProviderAccess(params, user);
        break;
      
      case 'Influencer':
        params = await filterInfluencerAccess(params, user);
        break;
      
      case 'Invoice':
      case 'Payment':
      case 'Subscription':
        params = await filterBillingAccess(params, user);
        break;
    }

    // Log data access for audit trail
    if (shouldAuditAccess(params)) {
      await logDataAccess(params, user);
    }

    return next(params);
  };
}

/**
 * Filter patient data based on user role
 */
async function filterPatientAccess(params: any, user: any): Promise<any> {
  if ((user.role as string) === "admin") {
    // Admins see everything
    return params;
  }

  if (user.role === 'provider') {
    // Providers only see their assigned patients
    if (params.action === 'findMany' || params.action === 'count') {
      params.args.where = {
        ...params.args.where,
        providerId: user.id,
      };
    } else if (params.action === 'findUnique' || params.action === 'findFirst') {
      // For single record queries, we'll check after fetch
      const originalNext = params.next;
      params.next = async (modifiedParams: any) => {
        const result = await originalNext(modifiedParams);
        if (result && result.providerId !== user.id) {
          logger.warn(`Provider ${user.email} attempted to access patient not assigned to them`);
          return null; // Return null if not authorized
        }
        return result;
      };
    } else if (params.action === 'update' || params.action === 'delete') {
      // Ensure provider can only modify their patients
      params.args.where = {
        ...params.args.where,
        providerId: user.id,
      };
    }
  }

  if (user.role === 'patient') {
    // Patients only see their own data
    const patientId = user.patientId;
    if (!patientId) {
      logger.error(`Patient user ${user.email} has no patientId`);
      throw new Error('Invalid patient context');
    }

    if (params.action === 'findMany' || params.action === 'count') {
      params.args.where = {
        ...params.args.where,
        id: patientId,
      };
    } else if (params.action === 'findUnique' || params.action === 'findFirst') {
      params.args.where = {
        ...params.args.where,
        id: patientId,
      };
    } else if (params.action === 'update' || params.action === 'delete') {
      // Patients cannot modify their own records
      logger.warn(`Patient ${user.email} attempted to modify patient data`);
      throw new Error('Patients cannot modify patient records');
    }
  }

  if (user.role === 'influencer') {
    // Influencers cannot access patient data directly
    logger.warn(`Influencer ${user.email} attempted to access patient data`);
    throw new Error('Influencers cannot access patient data');
  }

  return params;
}

/**
 * Filter order data based on user role
 */
async function filterOrderAccess(params: any, user: any): Promise<any> {
  if ((user.role as string) === "admin") {
    return params;
  }

  if (user.role === 'provider') {
    // Providers see orders for their patients
    if (params.action === 'findMany' || params.action === 'count') {
      params.args.where = {
        ...params.args.where,
        providerId: user.id,
      };
    } else if (params.action === 'findUnique' || params.action === 'findFirst') {
      const originalNext = params.next;
      params.next = async (modifiedParams: any) => {
        const result = await originalNext(modifiedParams);
        if (result && result.providerId !== user.id) {
          return null;
        }
        return result;
      };
    }
  }

  if (user.role === 'patient') {
    // Patients see their own orders
    if (params.action === 'findMany' || params.action === 'count') {
      params.args.where = {
        ...params.args.where,
        patientId: user.patientId,
      };
    }
  }

  return params;
}

/**
 * Filter SOAP note data based on user role
 */
async function filterSOAPNoteAccess(params: any, user: any): Promise<any> {
  if ((user.role as string) === "admin") {
    return params;
  }

  if (user.role === 'provider') {
    // Providers see SOAP notes they created or for their patients
    if (params.action === 'findMany' || params.action === 'count') {
      params.args.where = {
        ...params.args.where,
        OR: [
          { providerId: user.id },
          { patient: { providerId: user.id } },
        ],
      };
    }
  }

  if (user.role === 'patient') {
    // Patients can view their approved SOAP notes only
    if (params.action === 'findMany' || params.action === 'count') {
      params.args.where = {
        ...params.args.where,
        patientId: user.patientId,
        status: 'APPROVED', // Only show approved notes to patients
      };
    }
    
    // Patients cannot create/update/delete SOAP notes
    if (['create', 'update', 'delete'].includes(params.action)) {
      throw new Error('Patients cannot modify SOAP notes');
    }
  }

  return params;
}

/**
 * Filter provider data based on user role
 */
async function filterProviderAccess(params: any, user: any): Promise<any> {
  if ((user.role as string) === "admin") {
    // Admins see all provider data
    return params;
  }

  if (user.role === 'provider') {
    // Providers can only see their own full data
    if (params.action === 'findMany') {
      // For listing, show limited info about other providers
      params.args.select = params.args.select || {
        id: true,
        firstName: true,
        lastName: true,
        titleLine: true,
        npi: true,
        licenseState: true,
        // Hide sensitive fields
        passwordHash: false,
        passwordResetToken: false,
        passwordResetExpires: false,
        email: false,
        phone: false,
      };
    } else if (params.action === 'findUnique' || params.action === 'findFirst') {
      // For single queries, check if accessing own record
      const originalNext = params.next;
      params.next = async (modifiedParams: any) => {
        const result = await originalNext(modifiedParams);
        if (result && result.id !== user.id) {
          // Return limited info for other providers
          return {
            id: result.id,
            firstName: result.firstName,
            lastName: result.lastName,
            titleLine: result.titleLine,
            npi: result.npi,
            licenseState: result.licenseState,
          };
        }
        return result;
      };
    }
  }

  if (user.role === 'patient' || user.role === 'influencer') {
    // Patients and influencers see only basic provider info
    if (params.action === 'findMany' || params.action === 'findUnique') {
      params.args.select = {
        id: true,
        firstName: true,
        lastName: true,
        titleLine: true,
        npi: true,
        licenseState: true,
      };
    }
    
    // Cannot modify provider data
    if (['create', 'update', 'delete'].includes(params.action)) {
      throw new Error('Insufficient permissions to modify provider data');
    }
  }

  return params;
}

/**
 * Filter influencer data based on user role
 */
async function filterInfluencerAccess(params: any, user: any): Promise<any> {
  if ((user.role as string) === "admin") {
    return params;
  }

  if (user.role === 'influencer') {
    // Influencers can only see and modify their own data
    if (params.action === 'findMany' || params.action === 'count') {
      params.args.where = {
        ...params.args.where,
        id: user.influencerId,
      };
    } else if (['update', 'delete'].includes(params.action)) {
      params.args.where = {
        ...params.args.where,
        id: user.influencerId,
      };
    }
  } else {
    // Other roles cannot access influencer data
    throw new Error('Insufficient permissions to access influencer data');
  }

  return params;
}

/**
 * Filter billing data (invoices, payments, subscriptions) based on user role
 */
async function filterBillingAccess(params: any, user: any): Promise<any> {
  if ((user.role as string) === "admin") {
    return params;
  }

  if (user.role === 'provider') {
    // Providers can see billing for their patients
    if (params.action === 'findMany' || params.action === 'count') {
      params.args.where = {
        ...params.args.where,
        patient: {
          providerId: user.id,
        },
      };
    }
  }

  if (user.role === 'patient') {
    // Patients see their own billing
    if (params.action === 'findMany' || params.action === 'count') {
      params.args.where = {
        ...params.args.where,
        patientId: user.patientId,
      };
    }
  }

  if (user.role === 'influencer') {
    // Influencers cannot access billing data
    throw new Error('Influencers cannot access billing data');
  }

  return params;
}

/**
 * Determine if an operation should be audited
 */
function shouldAuditAccess(params: any): boolean {
  const auditableModels = ['Patient', 'Provider', 'Order', 'SOAPNote', 'Invoice', 'Payment'];
  const auditableActions = ['findUnique', 'findFirst', 'create', 'update', 'delete'];
  
  return auditableModels.includes(params.model) && auditableActions.includes(params.action);
}

/**
 * Log data access for audit trail
 */
async function logDataAccess(params: any, user: any): Promise<void> {
  try {
    // This would typically write to an audit log table
    // For now, we'll use the logger
    logger.info('Data access audit', {
      user: user.email,
      role: user.role,
      model: params.model,
      action: params.action,
      timestamp: new Date().toISOString(),
      // Don't log actual data for privacy
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to log data access:', error);
  }
}

/**
 * Apply the middleware to Prisma client
 */
export function applySecurityMiddleware(prisma: any): void {
  prisma.$use(createSecurityMiddleware());
}
