/**
 * Provider Routing Service
 * ========================
 * 
 * Enterprise feature for routing prescriptions to providers.
 * Supports multiple strategies: state-license match, round-robin, manual assignment, and provider self-select.
 * 
 * @module services/provider/providerRoutingService
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { 
  RoutingStrategy, 
  SoapApprovalMode,
  Provider,
  ProviderRoutingConfig,
  SOAPNote,
} from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface RoutingResult {
  providerId: number;
  providerName: string;
  assignmentSource: string;
  reason: string;
  warning?: string;
}

export interface SoapApprovalCheck {
  approved: boolean;
  soapNoteId?: number;
  mode: SoapApprovalMode;
  canProceed: boolean;
  warning?: string;
  soapNote?: SOAPNote;
}

export interface AvailableProvider {
  id: number;
  firstName: string;
  lastName: string;
  npi: string;
  licenseState: string | null;
  email: string | null;
  clinicId: number | null;
  // Stats for display
  pendingPrescriptions?: number;
  completedToday?: number;
}

export interface PrescriptionQueueItem {
  orderId: number;
  invoiceId?: number;
  patientId: number;
  patientName: string;
  patientState: string;
  clinicId: number;
  createdAt: Date;
  status: string;
  assignedProviderId?: number | null;
  soapNoteStatus?: string;
}

// ============================================================================
// Provider Routing Service
// ============================================================================

export const providerRoutingService = {
  // --------------------------------------------------------------------------
  // Configuration Management
  // --------------------------------------------------------------------------

  /**
   * Get routing configuration for a clinic
   */
  async getRoutingConfig(clinicId: number): Promise<ProviderRoutingConfig | null> {
    return prisma.providerRoutingConfig.findUnique({
      where: { clinicId },
    });
  },

  /**
   * Create or update routing configuration for a clinic
   */
  async upsertRoutingConfig(
    clinicId: number,
    config: {
      routingEnabled?: boolean;
      compensationEnabled?: boolean;
      routingStrategy?: RoutingStrategy;
      soapApprovalMode?: SoapApprovalMode;
      autoAssignOnPayment?: boolean;
    },
    actorId?: number
  ): Promise<ProviderRoutingConfig> {
    logger.info('[ProviderRoutingService] upsertRoutingConfig', {
      clinicId,
      config,
      actorId,
    });

    const existing = await prisma.providerRoutingConfig.findUnique({
      where: { clinicId },
    });

    if (existing) {
      return prisma.providerRoutingConfig.update({
        where: { clinicId },
        data: {
          ...config,
          updatedAt: new Date(),
        },
      });
    }

    return prisma.providerRoutingConfig.create({
      data: {
        clinicId,
        routingEnabled: config.routingEnabled ?? false,
        compensationEnabled: config.compensationEnabled ?? false,
        routingStrategy: config.routingStrategy ?? 'PROVIDER_CHOICE',
        soapApprovalMode: config.soapApprovalMode ?? 'ADVISORY',
        autoAssignOnPayment: config.autoAssignOnPayment ?? false,
      },
    });
  },

  // --------------------------------------------------------------------------
  // Provider Availability
  // --------------------------------------------------------------------------

  /**
   * Get available providers for a clinic, optionally filtered by patient state
   */
  async getAvailableProviders(
    clinicId: number,
    patientState?: string
  ): Promise<AvailableProvider[]> {
    logger.debug('[ProviderRoutingService] getAvailableProviders', {
      clinicId,
      patientState,
    });

    // Get providers for this clinic (via ProviderClinic junction or legacy clinicId)
    const providers = await prisma.provider.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { clinicId },
          {
            providerClinics: {
              some: {
                clinicId,
                isActive: true,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        npi: true,
        licenseState: true,
        email: true,
        clinicId: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    // Type for provider from the query
    type ProviderFromQuery = typeof providers[number];

    // If patient state is provided, filter by matching license state
    let filteredProviders: ProviderFromQuery[] = providers;
    if (patientState) {
      filteredProviders = providers.filter(
        (p: ProviderFromQuery) => !p.licenseState || p.licenseState === patientState
      );
      // If no providers match the state, return all (fallback)
      if (filteredProviders.length === 0) {
        filteredProviders = providers;
      }
    }

    // Get today's completed prescriptions count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const providerStats = await Promise.all(
      filteredProviders.map(async (p: ProviderFromQuery) => {
        const [pendingCount, completedToday] = await Promise.all([
          // Count unassigned orders waiting for this provider
          prisma.order.count({
            where: {
              clinicId,
              assignedProviderId: p.id,
              status: { in: ['pending', 'processing'] },
            },
          }),
          // Count completed today
          prisma.order.count({
            where: {
              providerId: p.id,
              status: 'sent',
              createdAt: { gte: today },
            },
          }),
        ]);

        return {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          npi: p.npi,
          licenseState: p.licenseState,
          email: p.email,
          clinicId: p.clinicId,
          pendingPrescriptions: pendingCount,
          completedToday,
        };
      })
    );

    return providerStats;
  },

  /**
   * Get providers by state license match
   */
  async getProvidersByState(
    clinicId: number,
    state: string
  ): Promise<AvailableProvider[]> {
    const providers = await prisma.provider.findMany({
      where: {
        status: 'ACTIVE',
        licenseState: state,
        OR: [
          { clinicId },
          {
            providerClinics: {
              some: {
                clinicId,
                isActive: true,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        npi: true,
        licenseState: true,
        email: true,
        clinicId: true,
      },
    });

    return providers;
  },

  // --------------------------------------------------------------------------
  // Routing Strategies
  // --------------------------------------------------------------------------

  /**
   * Auto-assign provider based on clinic's routing strategy
   */
  async assignProvider(
    clinicId: number,
    orderId: number,
    patientState?: string
  ): Promise<RoutingResult | null> {
    const config = await this.getRoutingConfig(clinicId);
    
    if (!config?.routingEnabled) {
      logger.debug('[ProviderRoutingService] Routing not enabled for clinic', { clinicId });
      return null;
    }

    logger.info('[ProviderRoutingService] assignProvider', {
      clinicId,
      orderId,
      strategy: config.routingStrategy,
      patientState,
    });

    let result: RoutingResult | null = null;

    switch (config.routingStrategy) {
      case 'STATE_LICENSE_MATCH':
        result = await this.assignByStateLicense(clinicId, orderId, patientState);
        break;
      case 'ROUND_ROBIN':
        result = await this.assignRoundRobin(clinicId, orderId);
        break;
      case 'MANUAL_ASSIGNMENT':
        // Manual assignment - don't auto-assign
        result = null;
        break;
      case 'PROVIDER_CHOICE':
        // Provider self-select - don't auto-assign
        result = null;
        break;
      default:
        logger.warn('[ProviderRoutingService] Unknown routing strategy', {
          strategy: config.routingStrategy,
        });
    }

    return result;
  },

  /**
   * Assign by state license match
   */
  async assignByStateLicense(
    clinicId: number,
    orderId: number,
    patientState?: string
  ): Promise<RoutingResult | null> {
    if (!patientState) {
      logger.warn('[ProviderRoutingService] No patient state for state-license match', {
        orderId,
      });
      return null;
    }

    const matchingProviders = await this.getProvidersByState(clinicId, patientState);

    if (matchingProviders.length === 0) {
      logger.warn('[ProviderRoutingService] No providers licensed in state', {
        clinicId,
        patientState,
      });
      return null;
    }

    // Pick the provider with the fewest pending prescriptions
    const providersWithLoad = await Promise.all(
      matchingProviders.map(async (p) => ({
        ...p,
        pendingCount: await prisma.order.count({
          where: {
            assignedProviderId: p.id,
            status: { in: ['pending', 'processing'] },
          },
        }),
      }))
    );

    const sorted = providersWithLoad.sort((a, b) => a.pendingCount - b.pendingCount);
    const selectedProvider = sorted[0];

    // Update order with assignment
    await prisma.order.update({
      where: { id: orderId },
      data: {
        assignedProviderId: selectedProvider.id,
        assignedAt: new Date(),
        assignmentSource: 'state_match',
      },
    });

    logger.info('[ProviderRoutingService] Assigned by state license', {
      orderId,
      providerId: selectedProvider.id,
      patientState,
    });

    return {
      providerId: selectedProvider.id,
      providerName: `${selectedProvider.firstName} ${selectedProvider.lastName}`,
      assignmentSource: 'state_match',
      reason: `Licensed in ${patientState} (${matchingProviders.length} available)`,
    };
  },

  /**
   * Assign using round-robin
   */
  async assignRoundRobin(
    clinicId: number,
    orderId: number
  ): Promise<RoutingResult | null> {
    const availableProviders = await this.getAvailableProviders(clinicId);

    if (availableProviders.length === 0) {
      logger.warn('[ProviderRoutingService] No available providers for round-robin', {
        clinicId,
      });
      return null;
    }

    // Get current round-robin state
    const config = await prisma.providerRoutingConfig.findUnique({
      where: { clinicId },
    });

    if (!config) {
      return null;
    }

    // Calculate next provider index
    const nextIndex = (config.lastAssignedIndex + 1) % availableProviders.length;
    const selectedProvider = availableProviders[nextIndex];

    // Update round-robin state and assign order in a transaction
    await prisma.$transaction([
      prisma.providerRoutingConfig.update({
        where: { clinicId },
        data: {
          lastAssignedIndex: nextIndex,
          lastAssignedProviderId: selectedProvider.id,
          updatedAt: new Date(),
        },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: {
          assignedProviderId: selectedProvider.id,
          assignedAt: new Date(),
          assignmentSource: 'round_robin',
        },
      }),
    ]);

    logger.info('[ProviderRoutingService] Assigned by round-robin', {
      orderId,
      providerId: selectedProvider.id,
      index: nextIndex,
    });

    return {
      providerId: selectedProvider.id,
      providerName: `${selectedProvider.firstName} ${selectedProvider.lastName}`,
      assignmentSource: 'round_robin',
      reason: `Round-robin selection (position ${nextIndex + 1} of ${availableProviders.length})`,
    };
  },

  /**
   * Manual assignment by admin
   */
  async manuallyAssign(
    orderId: number,
    providerId: number,
    actorId: number
  ): Promise<RoutingResult> {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        assignedProviderId: providerId,
        assignedAt: new Date(),
        assignmentSource: 'manual',
      },
    });

    logger.info('[ProviderRoutingService] Manual assignment', {
      orderId,
      providerId,
      actorId,
    });

    return {
      providerId: provider.id,
      providerName: `${provider.firstName} ${provider.lastName}`,
      assignmentSource: 'manual',
      reason: `Manually assigned by admin (user ${actorId})`,
    };
  },

  /**
   * Provider self-claims a prescription
   */
  async claimPrescription(
    orderId: number,
    providerId: number
  ): Promise<RoutingResult> {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    // Check order isn't already assigned
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { assignedProviderId: true },
    });

    if (order?.assignedProviderId) {
      throw new Error('This prescription is already assigned to a provider');
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        assignedProviderId: providerId,
        assignedAt: new Date(),
        assignmentSource: 'self_select',
      },
    });

    logger.info('[ProviderRoutingService] Provider claimed prescription', {
      orderId,
      providerId,
    });

    return {
      providerId: provider.id,
      providerName: `${provider.firstName} ${provider.lastName}`,
      assignmentSource: 'self_select',
      reason: 'Provider self-selected from queue',
    };
  },

  // --------------------------------------------------------------------------
  // SOAP Note Approval Check
  // --------------------------------------------------------------------------

  /**
   * Check SOAP approval status for prescribing
   */
  async checkSoapApproval(
    clinicId: number,
    patientId: number
  ): Promise<SoapApprovalCheck> {
    const config = await this.getRoutingConfig(clinicId);
    
    const mode = config?.soapApprovalMode ?? 'DISABLED';

    if (mode === 'DISABLED') {
      return {
        approved: true,
        mode,
        canProceed: true,
      };
    }

    // Find the most recent approved SOAP note for this patient
    const latestSoapNote = await prisma.sOAPNote.findFirst({
      where: {
        patientId,
        clinicId,
        status: 'APPROVED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (latestSoapNote) {
      return {
        approved: true,
        soapNoteId: latestSoapNote.id,
        mode,
        canProceed: true,
        soapNote: latestSoapNote,
      };
    }

    // No approved SOAP note found
    if (mode === 'REQUIRED') {
      return {
        approved: false,
        mode,
        canProceed: false,
        warning: 'An approved SOAP note is required before prescribing',
      };
    }

    // Advisory mode - warn but allow
    return {
      approved: false,
      mode,
      canProceed: true,
      warning: 'No approved SOAP note found. You may proceed, but documentation is recommended.',
    };
  },

  // --------------------------------------------------------------------------
  // Prescription Queue
  // --------------------------------------------------------------------------

  /**
   * Get unassigned prescriptions for provider self-select queue
   */
  async getUnassignedPrescriptions(
    clinicId: number,
    providerId?: number
  ): Promise<PrescriptionQueueItem[]> {
    // Get paid invoices without assigned providers
    const unassignedOrders = await prisma.order.findMany({
      where: {
        clinicId,
        assignedProviderId: null,
        // Only include orders that are ready for prescription
        status: { in: ['pending', 'processing'] },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            state: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Get provider's license state if provided (for filtering)
    let providerState: string | null = null;
    if (providerId) {
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: { licenseState: true },
      });
      providerState = provider?.licenseState ?? null;
    }

    // Type for order from the query
    type OrderFromQuery = typeof unassignedOrders[number];

    // Filter and transform
    return unassignedOrders
      .filter((order: OrderFromQuery) => {
        // If provider has a license state, only show patients from that state
        if (providerState && order.patient.state !== providerState) {
          return false;
        }
        return true;
      })
      .map((order: OrderFromQuery) => ({
        orderId: order.id,
        patientId: order.patient.id,
        patientName: `${order.patient.firstName} ${order.patient.lastName}`,
        patientState: order.patient.state,
        clinicId: order.clinicId ?? 0,
        createdAt: order.createdAt,
        status: order.status ?? 'pending',
        assignedProviderId: order.assignedProviderId,
      }));
  },

  /**
   * Get provider's assigned prescriptions queue
   */
  async getProviderAssignedQueue(
    providerId: number,
    clinicId?: number
  ): Promise<PrescriptionQueueItem[]> {
    const where: {
      assignedProviderId: number;
      status: { in: string[] };
      clinicId?: number;
    } = {
      assignedProviderId: providerId,
      status: { in: ['pending', 'processing'] },
    };

    if (clinicId) {
      where.clinicId = clinicId;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            state: true,
          },
        },
      },
      orderBy: {
        assignedAt: 'asc',
      },
    });

    // Type for order from the query
    type AssignedOrderType = typeof orders[number];

    return orders.map((order: AssignedOrderType) => ({
      orderId: order.id,
      patientId: order.patient.id,
      patientName: `${order.patient.firstName} ${order.patient.lastName}`,
      patientState: order.patient.state,
      clinicId: order.clinicId ?? 0,
      createdAt: order.createdAt,
      status: order.status ?? 'pending',
      assignedProviderId: order.assignedProviderId,
    }));
  },

  /**
   * Get admin view of routing queue with all unassigned items
   */
  async getAdminRoutingQueue(
    clinicId: number
  ): Promise<{
    unassigned: PrescriptionQueueItem[];
    assigned: { providerId: number; providerName: string; count: number }[];
    providers: AvailableProvider[];
  }> {
    const [unassigned, providers] = await Promise.all([
      this.getUnassignedPrescriptions(clinicId),
      this.getAvailableProviders(clinicId),
    ]);

    // Get count of assigned orders per provider
    const assignedCounts = await prisma.order.groupBy({
      by: ['assignedProviderId'],
      where: {
        clinicId,
        assignedProviderId: { not: null },
        status: { in: ['pending', 'processing'] },
      },
      _count: {
        id: true,
      },
    });

    const assigned = await Promise.all(
      assignedCounts.map(async (ac: { assignedProviderId: number | null; _count: { id: number } }) => {
        const provider = providers.find((p) => p.id === ac.assignedProviderId);
        return {
          providerId: ac.assignedProviderId!,
          providerName: provider
            ? `${provider.firstName} ${provider.lastName}`
            : 'Unknown',
          count: ac._count.id,
        };
      })
    );

    return {
      unassigned,
      assigned,
      providers,
    };
  },
};

export type ProviderRoutingService = typeof providerRoutingService;
