import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { UserRole } from '@prisma/client';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return withAuthParams<RouteContext>(
    async (req, user, context) => {
      const params = await context.params;
      return handler(req, user, params);
    },
    { roles: ['super_admin'] }
  );
}

/**
 * GET /api/super-admin/clinics/[id]
 * Get a single clinic by ID
 */
export const GET = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const clinicId = parseInt(params.id);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      // Note: Explicitly selecting fields for backwards compatibility
      // (buttonTextColor may not exist in production DB if migration hasn't run)
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          status: true,
          adminEmail: true,
          supportEmail: true,
          phone: true,
          timezone: true,
          address: true,
          billingPlan: true,
          patientLimit: true,
          providerLimit: true,
          storageLimit: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          logoUrl: true,
          iconUrl: true,
          faviconUrl: true,
          customCss: true,
          settings: true,
          features: true,
          integrations: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              patients: true,
              users: true,
            },
          },
        },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Count providers (users with role PROVIDER) for this clinic
      const providerCount = await prisma.user.count({
        where: {
          clinicId: clinic.id,
          role: UserRole.PROVIDER,
        },
      });

      // Add provider count to the response
      const clinicWithProviderCount = {
        ...clinic,
        _count: {
          ...clinic._count,
          providers: providerCount,
        },
      };

      return NextResponse.json({ clinic: clinicWithProviderCount });
    } catch (error) {
      logger.error('Error fetching clinic', error instanceof Error ? error : undefined, {
        route: 'GET /api/super-admin/clinics/[id]',
        clinicId: params.id,
      });
      return NextResponse.json(
        {
          error: 'Failed to fetch clinic',
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  }
);

/**
 * PUT /api/super-admin/clinics/[id]
 * Update a clinic
 */
export const PUT = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const clinicId = parseInt(params.id);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      const body = await req.json();
      const {
        name,
        subdomain,
        customDomain,
        adminEmail,
        supportEmail,
        phone,
        timezone,
        address,
        settings,
        features,
        billingPlan,
        patientLimit,
        providerLimit,
        storageLimit,
        primaryColor,
        secondaryColor,
        accentColor,
        buttonTextColor,
        logoUrl,
        iconUrl,
        faviconUrl,
        status,
      } = body;

      // Check if clinic exists and load current features for merge
      const existingClinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, subdomain: true, features: true },
      });

      if (!existingClinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Check if subdomain is taken by another clinic
      if (subdomain && subdomain !== existingClinic.subdomain) {
        const subdomainTaken = await prisma.clinic.findUnique({
          where: { subdomain },
          select: { id: true },
        });
        if (subdomainTaken) {
          return NextResponse.json({ error: 'Subdomain is already taken' }, { status: 400 });
        }
      }

      // Update the clinic
      const updatedClinic = await prisma.clinic.update({
        where: { id: clinicId },
        data: {
          ...(name && { name }),
          ...(subdomain && { subdomain }),
          ...(customDomain !== undefined && { customDomain: customDomain || null }),
          ...(adminEmail && { adminEmail }),
          ...(supportEmail !== undefined && { supportEmail: supportEmail || null }),
          ...(phone !== undefined && { phone: phone || null }),
          ...(timezone && { timezone }),
          ...(address !== undefined && { address: address || null }),
          ...(settings && { settings }),
          ...(features && {
            features: {
              ...((existingClinic.features as Record<string, unknown>) || {}),
              ...features,
            },
          }),
          ...(billingPlan && { billingPlan }),
          ...(patientLimit && { patientLimit }),
          ...(providerLimit && { providerLimit }),
          ...(storageLimit && { storageLimit }),
          ...(primaryColor && { primaryColor }),
          ...(secondaryColor && { secondaryColor }),
          ...(accentColor && { accentColor }),
          ...(buttonTextColor && { buttonTextColor }),
          ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
          ...(iconUrl !== undefined && { iconUrl: iconUrl || null }),
          ...(faviconUrl !== undefined && { faviconUrl: faviconUrl || null }),
          ...(status && { status }),
        },
      });

      // Create audit log (optional)
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
        });

        if (dbUser) {
          await prisma.clinicAuditLog.create({
            data: {
              clinicId: updatedClinic.id,
              action: 'UPDATE',
              userId: user.id,
              details: {
                updatedBy: user.id,
                changes: body,
              },
            },
          });
        }
      } catch (auditError) {
        logger.error('Failed to create audit log', auditError instanceof Error ? auditError : undefined);
      }

      return NextResponse.json({
        clinic: updatedClinic,
        message: 'Clinic updated successfully',
      });
    } catch (error: any) {
      logger.error('Error updating clinic', error instanceof Error ? error : undefined, {
        route: 'PATCH /api/super-admin/clinics/[id]',
        clinicId: params.id,
      });
      return NextResponse.json(
        { error: error.message || 'Failed to update clinic' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/super-admin/clinics/[id]
 * Delete a clinic and ALL related data (comprehensive cascade)
 *
 * Requires body: { confirmClinicName: string }
 * The confirmClinicName must match the clinic's actual name for safety.
 */
export const DELETE = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const clinicId = parseInt(params.id);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      // Parse body for confirmation
      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        // No body provided
      }

      const { confirmClinicName } = body as { confirmClinicName?: string };

      // Check if clinic exists and get counts for the confirmation response
      const existingClinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              patients: true,
              users: true,
              orders: true,
              providers: true,
            },
          },
        },
      });

      if (!existingClinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Require clinic name confirmation for safety
      if (!confirmClinicName || confirmClinicName !== existingClinic.name) {
        return NextResponse.json(
          {
            error: 'Clinic name confirmation required',
            clinicName: existingClinic.name,
            counts: existingClinic._count,
          },
          { status: 400 }
        );
      }

      // Comprehensive cascade delete within a single transaction
      // Tables with onDelete: Cascade in the schema auto-delete their children.
      // We only need to explicitly delete tables WITHOUT cascade, in dependency order.
      await prisma.$transaction(
        async (tx) => {
          // ===== Phase 1: Collect IDs for tables that lack a direct clinicId =====
          const patientIds = (
            await tx.patient.findMany({ where: { clinicId }, select: { id: true } })
          ).map((p) => p.id);
          const orderIds = (
            await tx.order.findMany({ where: { clinicId }, select: { id: true } })
          ).map((o) => o.id);
          const providerIds = (
            await tx.provider.findMany({ where: { clinicId }, select: { id: true } })
          ).map((p) => p.id);
          const subscriptionIds = (
            await tx.subscription.findMany({ where: { clinicId }, select: { id: true } })
          ).map((s) => s.id);
          const integrationIds = (
            await tx.integration.findMany({ where: { clinicId }, select: { id: true } })
          ).map((i) => i.id);
          const webhookIds = (
            await tx.webhookConfig.findMany({ where: { clinicId }, select: { id: true } })
          ).map((w) => w.id);
          const userIds = (
            await tx.user.findMany({ where: { clinicId }, select: { id: true } })
          ).map((u) => u.id);
          const templateIds = (
            await tx.intakeFormTemplate.findMany({ where: { clinicId }, select: { id: true } })
          ).map((t) => t.id);

          // ===== Phase 2: Deepest leaf tables (no clinicId, no cascade) =====

          // Order children
          if (orderIds.length > 0) {
            await tx.rx.deleteMany({ where: { orderId: { in: orderIds } } });
            await tx.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
          }

          // Subscription children
          if (subscriptionIds.length > 0) {
            await tx.subscriptionAction.deleteMany({
              where: { subscriptionId: { in: subscriptionIds } },
            });
          }

          // Provider children (non-cascading)
          if (providerIds.length > 0) {
            await tx.providerAudit.deleteMany({ where: { providerId: { in: providerIds } } });
          }

          // Patient children (non-cascading)
          if (patientIds.length > 0) {
            await tx.patientAudit.deleteMany({ where: { patientId: { in: patientIds } } });
            await tx.patientPortalInvite.deleteMany({
              where: { patientId: { in: patientIds } },
            });
            await tx.discountUsage.deleteMany({ where: { patientId: { in: patientIds } } });
          }

          // Integration children (non-cascading)
          if (integrationIds.length > 0) {
            await tx.integrationLog.deleteMany({
              where: { integrationId: { in: integrationIds } },
            });
          }

          // Webhook children (non-cascading)
          if (webhookIds.length > 0) {
            await tx.webhookDelivery.deleteMany({ where: { webhookId: { in: webhookIds } } });
          }

          // Intake form children (submissions -> responses cascade, but submissions don't cascade from templates)
          if (templateIds.length > 0) {
            // IntakeFormResponse cascades from IntakeFormSubmission deletion
            await tx.intakeFormSubmission.deleteMany({
              where: { templateId: { in: templateIds } },
            });
            await tx.intakeFormLink.deleteMany({ where: { templateId: { in: templateIds } } });
            // IntakeFormQuestion has onDelete: Cascade from IntakeFormTemplate
          }

          // ===== Phase 3: Tables with clinicId, ordered by FK dependencies =====
          // Delete tables that reference other clinic tables first

          // Compensation & platform billing (reference Order, Provider, Patient)
          await tx.providerCompensationEvent.deleteMany({ where: { clinicId } });
          await tx.platformFeeEvent.deleteMany({ where: { clinicId } });
          await tx.patientPrescriptionCycle.deleteMany({ where: { clinicId } });

          // Refill queue (references Order, Subscription, Patient)
          await tx.refillQueue.deleteMany({ where: { clinicId } });

          // Shipping updates (references Order, Patient)
          await tx.patientShippingUpdate.deleteMany({ where: { clinicId } });

          // Ticket children (most do NOT have onDelete: Cascade from Ticket)
          const ticketIds = (
            await tx.ticket.findMany({ where: { clinicId }, select: { id: true } })
          ).map((t) => t.id);
          if (ticketIds.length > 0) {
            // TicketMerge references tickets without cascade
            await tx.ticketMerge.deleteMany({
              where: {
                OR: [
                  { sourceTicketId: { in: ticketIds } },
                  { targetTicketId: { in: ticketIds } },
                ],
              },
            });
            await tx.ticketSLA.deleteMany({ where: { ticketId: { in: ticketIds } } });
            await tx.ticketEscalation.deleteMany({ where: { ticketId: { in: ticketIds } } });
            await tx.ticketWorkLog.deleteMany({ where: { ticketId: { in: ticketIds } } });
            await tx.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ticketIds } } });
            await tx.ticketComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
            await tx.ticketAssignment.deleteMany({ where: { ticketId: { in: ticketIds } } });
            // TicketWatcher, TicketRelation, TicketAttachment, TicketActivity have onDelete: Cascade
          }
          await tx.ticket.deleteMany({ where: { clinicId } });

          // Payments (references Invoice, Subscription, Patient, PaymentMethod)
          await tx.payment.deleteMany({ where: { clinicId } });

          // Orders (Rx, OrderEvent already deleted above)
          await tx.order.deleteMany({ where: { clinicId } });

          // Invoices (InvoiceItem has onDelete: Cascade)
          await tx.invoice.deleteMany({ where: { clinicId } });

          // Subscriptions (SubscriptionAction already deleted above)
          await tx.subscription.deleteMany({ where: { clinicId } });

          // Payment methods (referenced by Subscription - now safe)
          await tx.paymentMethod.deleteMany({ where: { clinicId } });

          // ===== Phase 4: Remaining patient/clinical data =====

          // SOAPNoteRevision does NOT cascade from SOAPNote - delete first
          const soapNoteIds = (
            await tx.sOAPNote.findMany({ where: { clinicId }, select: { id: true } })
          ).map((s) => s.id);
          if (soapNoteIds.length > 0) {
            await tx.sOAPNoteRevision.deleteMany({
              where: { soapNoteId: { in: soapNoteIds } },
            });
          }
          await tx.sOAPNote.deleteMany({ where: { clinicId } });

          // LabReport before PatientDocument (LabReport references PatientDocument)
          // LabReportResult has onDelete: Cascade from LabReport
          await tx.labReport.deleteMany({ where: { clinicId } });
          await tx.patientDocument.deleteMany({ where: { clinicId } });
          await tx.patientPhoto.deleteMany({ where: { clinicId } });

          // Telehealth (TelehealthSessionEvent cascades from TelehealthSession)
          await tx.telehealthSession.deleteMany({ where: { clinicId } });

          // Superbills (SuperbillItem has onDelete: Cascade)
          await tx.superbill.deleteMany({ where: { clinicId } });

          // Care plans (CarePlanGoal, CarePlanActivity, CarePlanProgress all cascade)
          await tx.carePlan.deleteMany({ where: { clinicId } });

          // Appointments (children cascade)
          await tx.appointment.deleteMany({ where: { clinicId } });

          // AI & chat
          await tx.aIConversation.deleteMany({ where: { clinicId } });
          await tx.patientChatMessage.deleteMany({ where: { clinicId } });

          // SMS
          await tx.smsLog.deleteMany({ where: { clinicId } });
          await tx.smsOptOut.deleteMany({ where: { clinicId } });
          await tx.smsQuietHours.deleteMany({ where: { clinicId } });
          await tx.smsRateLimit.deleteMany({ where: { clinicId } });

          // Health tracking logs
          await tx.patientWaterLog.deleteMany({ where: { clinicId } });
          await tx.patientExerciseLog.deleteMany({ where: { clinicId } });
          await tx.patientSleepLog.deleteMany({ where: { clinicId } });
          await tx.patientNutritionLog.deleteMany({ where: { clinicId } });

          // Referrals & commissions
          await tx.referralTracking.deleteMany({ where: { clinicId } });
          await tx.commission.deleteMany({ where: { clinicId } });
          await tx.affiliateReferral.deleteMany({ where: { clinicId } });

          // Internal messages (MessageReaction has onDelete: Cascade)
          await tx.internalMessage.deleteMany({ where: { clinicId } });

          // Notifications, email, calendar
          await tx.notification.deleteMany({ where: { clinicId } });
          await tx.emailLog.deleteMany({ where: { clinicId } });
          await tx.scheduledEmail.deleteMany({ where: { clinicId } });
          await tx.calendarSubscription.deleteMany({ where: { clinicId } });

          // Financial analytics
          await tx.financialMetrics.deleteMany({ where: { clinicId } });
          await tx.savedReport.deleteMany({ where: { clinicId } });
          await tx.reportExport.deleteMany({ where: { clinicId } });
          await tx.paymentReconciliation.deleteMany({ where: { clinicId } });

          // Sales rep assignments
          await tx.patientSalesRepAssignment.deleteMany({ where: { clinicId } });

          // ===== Phase 5: Affiliate system (deep dependency chain) =====
          await tx.affiliateCommissionEvent.deleteMany({ where: { clinicId } });
          await tx.affiliatePlanAssignment.deleteMany({ where: { clinicId } });
          await tx.affiliateCommissionPlan.deleteMany({ where: { clinicId } });
          await tx.affiliateRefCode.deleteMany({ where: { clinicId } });
          await tx.affiliateTouch.deleteMany({ where: { clinicId } });
          await tx.affiliatePayout.deleteMany({ where: { clinicId } });
          await tx.affiliateFraudAlert.deleteMany({ where: { clinicId } });
          await tx.affiliateFraudConfig.deleteMany({ where: { clinicId } });
          await tx.affiliateCompetition.deleteMany({ where: { clinicId } });
          await tx.affiliateAttributionConfig.deleteMany({ where: { clinicId } });
          await tx.affiliateCommission.deleteMany({ where: { clinicId } });
          await tx.affiliateApplication.deleteMany({ where: { clinicId } });
          await tx.affiliateProgram.deleteMany({ where: { clinicId } });
          await tx.affiliate.deleteMany({ where: { clinicId } });
          await tx.influencer.deleteMany({ where: { clinicId } });
          await tx.retentionOffer.deleteMany({ where: { clinicId } });

          // Products & pricing
          await tx.discountCode.deleteMany({ where: { clinicId } });
          await tx.promotion.deleteMany({ where: { clinicId } });
          await tx.productBundle.deleteMany({ where: { clinicId } });
          await tx.pricingRule.deleteMany({ where: { clinicId } });
          await tx.product.deleteMany({ where: { clinicId } });

          // Challenges (ChallengeParticipant has onDelete: Cascade)
          await tx.challenge.deleteMany({ where: { clinicId } });

          // ===== Phase 6: Scheduling & config =====
          await tx.appointmentTypeConfig.deleteMany({ where: { clinicId } });
          await tx.providerAvailability.deleteMany({ where: { clinicId } });
          await tx.providerTimeOff.deleteMany({ where: { clinicId } });
          await tx.billingCode.deleteMany({ where: { clinicId } });
          await tx.carePlanTemplate.deleteMany({ where: { clinicId } });

          // Enterprise ticket system config (TicketTeamMember cascades from TicketTeam)
          await tx.ticketSavedView.deleteMany({ where: { clinicId } });
          await tx.ticketAutomationRule.deleteMany({ where: { clinicId } });
          await tx.ticketTemplate.deleteMany({ where: { clinicId } });
          await tx.ticketMacro.deleteMany({ where: { clinicId } });
          await tx.ticketBusinessHours.deleteMany({ where: { clinicId } });
          await tx.slaPolicyConfig.deleteMany({ where: { clinicId } });
          await tx.ticketTeam.deleteMany({ where: { clinicId } });

          // Provider routing & compensation config
          await tx.providerRoutingConfig.deleteMany({ where: { clinicId } });
          await tx.providerCompensationPlan.deleteMany({ where: { clinicId } });

          // Platform billing config (invoice references config, so delete invoice first)
          await tx.clinicPlatformInvoice.deleteMany({ where: { clinicId } });
          await tx.clinicPlatformFeeConfig.deleteMany({ where: { clinicId } });

          // SOC 2 compliance
          await tx.policyAcknowledgment.deleteMany({ where: { clinicId } });

          // Intake form templates (IntakeFormQuestion has onDelete: Cascade)
          await tx.intakeFormTemplate.deleteMany({ where: { clinicId } });

          // ===== Phase 7: Infrastructure & config =====
          await tx.webhookLog.deleteMany({ where: { clinicId } });
          await tx.webhookConfig.deleteMany({ where: { clinicId } });
          await tx.apiKey.deleteMany({ where: { clinicId } });
          await tx.integration.deleteMany({ where: { clinicId } });
          await tx.systemSettings.deleteMany({ where: { clinicId } });
          await tx.clinicInviteCode.deleteMany({ where: { clinicId } });
          await tx.clinicAuditLog.deleteMany({ where: { clinicId } });
          await tx.patientCounter.deleteMany({ where: { clinicId } });

          // Multi-clinic assignments (UserClinic & ProviderClinic have onDelete: Cascade)
          await tx.userClinic.deleteMany({ where: { clinicId } });
          await tx.providerClinic.deleteMany({ where: { clinicId } });

          // ===== Phase 8: Core entities =====
          // Patient tables with onDelete: Cascade from Patient auto-delete:
          // PatientStreak, PatientAchievement, PatientPoints, PointsHistory,
          // ChallengeParticipant, PushSubscription, PatientWeightLog, PatientMedicationReminder
          await tx.patient.deleteMany({ where: { clinicId } });

          // Provider (ProviderAudit already deleted, ProviderClinic cascades)
          await tx.provider.deleteMany({ where: { clinicId } });

          // User-referenced tables without clinicId (must delete before users)
          if (userIds.length > 0) {
            await tx.userSession.deleteMany({ where: { userId: { in: userIds } } });
            await tx.userAuditLog.deleteMany({ where: { userId: { in: userIds } } });
            await tx.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
            await tx.policyApproval.deleteMany({ where: { userId: { in: userIds } } });
            // EmailVerificationToken, UserNotificationPreference, Notification have onDelete: Cascade from User

            // Clear self-referencing createdById to avoid FK violation
            await tx.user.updateMany({
              where: { clinicId, createdById: { not: null } },
              data: { createdById: null },
            });
          }

          // Users (Notification, EmailVerificationToken, UserNotificationPreference cascade from User)
          await tx.user.deleteMany({ where: { clinicId } });

          // ===== Phase 9: The clinic itself =====
          await tx.clinic.delete({ where: { id: clinicId } });
        },
        { timeout: 120000 }
      );

      logger.info('Clinic deleted by super admin', {
        clinicId,
        clinicName: existingClinic.name,
        deletedBy: user.id,
        counts: existingClinic._count,
      });

      return NextResponse.json({
        message: 'Clinic deleted successfully',
      });
    } catch (error: unknown) {
      logger.error('Error deleting clinic', error instanceof Error ? error : undefined, {
        route: 'DELETE /api/super-admin/clinics/[id]',
        clinicId: params.id,
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to delete clinic' },
        { status: 500 }
      );
    }
  }
);
