#!/usr/bin/env npx tsx
/**
 * DELETE EON MEDICAL DUMMY CLINIC
 * 
 * Removes the "EON Medical" dummy clinic (clinic ID 1, subdomain "eonmedical")
 * and ALL of its related data. This was the first test clinic created during
 * initial production setup and is no longer needed.
 *
 * SAFETY GUARDS:
 * - Hardcoded to ONLY delete clinic with subdomain = 'eonmedical'
 * - Will NEVER touch clinicId 3 (EONMeds) or any other clinic
 * - Runs in dry-run mode by default; pass --execute to actually delete
 * - Confirms clinic identity before any deletions
 *
 * Usage:
 *   npx tsx scripts/delete-eon-medical-clinic.ts                  # Dry run (audit only)
 *   npx tsx scripts/delete-eon-medical-clinic.ts --execute         # Actually delete
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient({ log: ['warn', 'error'] });
const EXECUTE = process.argv.includes('--execute');

const PROTECTED_CLINIC_IDS = [3]; // EONMeds — NEVER delete

async function findTargetClinic() {
  const clinic = await prisma.clinic.findFirst({
    where: {
      subdomain: 'eonmedical',
      adminEmail: 'admin@eonmedical.com',
    },
    select: {
      id: true,
      name: true,
      subdomain: true,
      adminEmail: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          patients: true,
          providers: true,
          users: true,
          orders: true,
        },
      },
    },
  });

  return clinic;
}

async function auditClinicData(clinicId: number) {
  console.log('\n📊 Auditing all related data...\n');

  const counts: Record<string, number> = {};

  const tables: Array<{ label: string; count: () => Promise<number> }> = [
    { label: 'Patients', count: () => prisma.patient.count({ where: { clinicId } }) },
    { label: 'Users', count: () => prisma.user.count({ where: { clinicId } }) },
    { label: 'Providers', count: () => prisma.provider.count({ where: { clinicId } }) },
    { label: 'Orders', count: () => prisma.order.count({ where: { clinicId } }) },
    { label: 'Invoices', count: () => prisma.invoice.count({ where: { clinicId } }) },
    { label: 'Payments', count: () => prisma.payment.count({ where: { clinicId } }) },
    { label: 'PaymentMethods', count: () => prisma.paymentMethod.count({ where: { clinicId } }) },
    { label: 'Subscriptions', count: () => prisma.subscription.count({ where: { clinicId } }) },
    { label: 'SOAPNotes', count: () => prisma.sOAPNote.count({ where: { clinicId } }) },
    { label: 'PatientDocuments', count: () => prisma.patientDocument.count({ where: { clinicId } }) },
    { label: 'AIConversations', count: () => prisma.aIConversation.count({ where: { clinicId } }) },
    { label: 'Tickets', count: () => prisma.ticket.count({ where: { clinicId } }) },
    { label: 'ClinicAuditLogs', count: () => prisma.clinicAuditLog.count({ where: { clinicId } }) },
    { label: 'WebhookLogs', count: () => prisma.webhookLog.count({ where: { clinicId } }) },
    { label: 'InternalMessages', count: () => prisma.internalMessage.count({ where: { clinicId } }) },
    { label: 'IntakeFormTemplates', count: () => prisma.intakeFormTemplate.count({ where: { clinicId } }) },
    { label: 'Appointments', count: () => prisma.appointment.count({ where: { clinicId } }) },
    { label: 'Superbills', count: () => prisma.superbill.count({ where: { clinicId } }) },
    { label: 'CarePlans', count: () => prisma.carePlan.count({ where: { clinicId } }) },
    { label: 'SmsLogs', count: () => prisma.smsLog.count({ where: { clinicId } }) },
    { label: 'Products', count: () => prisma.product.count({ where: { clinicId } }) },
    { label: 'DiscountCodes', count: () => prisma.discountCode.count({ where: { clinicId } }) },
    { label: 'UserClinics', count: () => prisma.userClinic.count({ where: { clinicId } }) },
    { label: 'ProviderClinics', count: () => prisma.providerClinic.count({ where: { clinicId } }) },
    { label: 'SystemSettings', count: () => prisma.systemSettings.count({ where: { clinicId } }) },
    { label: 'EmailLogs', count: () => prisma.emailLog.count({ where: { clinicId } }) },
    { label: 'Notifications', count: () => prisma.notification.count({ where: { clinicId } }) },
    { label: 'LabReports', count: () => prisma.labReport.count({ where: { clinicId } }) },
  ];

  for (const t of tables) {
    try {
      counts[t.label] = await t.count();
    } catch {
      counts[t.label] = -1; // table might not exist
    }
  }

  let totalRecords = 0;
  for (const [label, count] of Object.entries(counts)) {
    if (count > 0) {
      console.log(`   ${label}: ${count}`);
      totalRecords += count;
    } else if (count === -1) {
      console.log(`   ${label}: (error reading)`);
    }
  }

  console.log(`\n   TOTAL records to delete: ~${totalRecords}+`);
  return totalRecords;
}

async function deleteClinicData(clinicId: number) {
  console.log('\n🗑️  Deleting all data for clinic', clinicId, '...\n');

  // Use raw SQL for efficiency — delete in dependency order (deepest children first).
  // This is safer than Prisma deleteMany for deeply nested relations.
  // Helper: patient subquery for this clinic
  const PQ = `(SELECT id FROM "Patient" WHERE "clinicId" = $1)`;
  const OQ = `(SELECT id FROM "Order" WHERE "clinicId" = $1)`;
  const UQ = `(SELECT id FROM "User" WHERE "clinicId" = $1)`;
  const PVQ = `(SELECT id FROM "Provider" WHERE "clinicId" = $1)`;

  const deleteQueries: Array<{ label: string; sql: string }> = [
    // --- Deepest patient children (use patientId subquery for safety) ---
    { label: 'PointsHistory', sql: `DELETE FROM "PointsHistory" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientPoints', sql: `DELETE FROM "PatientPoints" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientAchievement', sql: `DELETE FROM "PatientAchievement" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientStreak', sql: `DELETE FROM "PatientStreak" WHERE "patientId" IN ${PQ}` },
    { label: 'PushSubscription', sql: `DELETE FROM "PushSubscription" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientShippingUpdate', sql: `DELETE FROM "PatientShippingUpdate" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientChatMessage', sql: `DELETE FROM "PatientChatMessage" WHERE "patientId" IN ${PQ}` },
    { label: 'AffiliateReferral', sql: `DELETE FROM "AffiliateReferral" WHERE "patientId" IN ${PQ}` },
    { label: 'DiscountUsage', sql: `DELETE FROM "DiscountUsage" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientNutritionLog', sql: `DELETE FROM "PatientNutritionLog" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientSleepLog', sql: `DELETE FROM "PatientSleepLog" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientExerciseLog', sql: `DELETE FROM "PatientExerciseLog" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientWaterLog', sql: `DELETE FROM "PatientWaterLog" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientWeightLog', sql: `DELETE FROM "PatientWeightLog" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientMedicationReminder', sql: `DELETE FROM "PatientMedicationReminder" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientDeviceConnection', sql: `DELETE FROM "PatientDeviceConnection" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientPhoto', sql: `DELETE FROM "PatientPhoto" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientPrescriptionCycle', sql: `DELETE FROM "PatientPrescriptionCycle" WHERE "patientId" IN ${PQ}` },

    // --- Intake system (IntakeFormSubmission has no clinicId — use patientId/templateId) ---
    { label: 'IntakeFormResponse', sql: `DELETE FROM "IntakeFormResponse" WHERE "submissionId" IN (SELECT id FROM "IntakeFormSubmission" WHERE "patientId" IN ${PQ})` },
    { label: 'IntakeFormSubmission', sql: `DELETE FROM "IntakeFormSubmission" WHERE "patientId" IN ${PQ}` },
    { label: 'IntakeFormLink', sql: `DELETE FROM "IntakeFormLink" WHERE "clinicId" = $1` },
    { label: 'IntakeFormQuestion', sql: `DELETE FROM "IntakeFormQuestion" WHERE "templateId" IN (SELECT id FROM "IntakeFormTemplate" WHERE "clinicId" = $1)` },
    { label: 'IntakeFormTemplate', sql: `DELETE FROM "IntakeFormTemplate" WHERE "clinicId" = $1` },

    // --- Care plans ---
    { label: 'CarePlanProgress', sql: `DELETE FROM "CarePlanProgress" WHERE "activityId" IN (SELECT id FROM "CarePlanActivity" WHERE "carePlanId" IN (SELECT id FROM "CarePlan" WHERE "clinicId" = $1))` },
    { label: 'CarePlanActivity', sql: `DELETE FROM "CarePlanActivity" WHERE "carePlanId" IN (SELECT id FROM "CarePlan" WHERE "clinicId" = $1)` },
    { label: 'CarePlanGoal', sql: `DELETE FROM "CarePlanGoal" WHERE "carePlanId" IN (SELECT id FROM "CarePlan" WHERE "clinicId" = $1)` },
    { label: 'CarePlan', sql: `DELETE FROM "CarePlan" WHERE "clinicId" = $1` },
    { label: 'CarePlanTemplate', sql: `DELETE FROM "CarePlanTemplate" WHERE "clinicId" = $1` },

    // --- Scheduling ---
    { label: 'AppointmentReminder', sql: `DELETE FROM "AppointmentReminder" WHERE "appointmentId" IN (SELECT id FROM "Appointment" WHERE "clinicId" = $1)` },
    { label: 'Appointment', sql: `DELETE FROM "Appointment" WHERE "clinicId" = $1` },
    { label: 'ProviderTimeOff', sql: `DELETE FROM "ProviderTimeOff" WHERE "clinicId" = $1` },
    { label: 'ProviderDateOverride', sql: `DELETE FROM "ProviderDateOverride" WHERE "clinicId" = $1` },
    { label: 'ProviderAvailability', sql: `DELETE FROM "ProviderAvailability" WHERE "clinicId" = $1` },
    { label: 'AppointmentTypeConfig', sql: `DELETE FROM "AppointmentTypeConfig" WHERE "clinicId" = $1` },

    // --- Superbills ---
    { label: 'SuperbillItem', sql: `DELETE FROM "SuperbillItem" WHERE "superbillId" IN (SELECT id FROM "Superbill" WHERE "clinicId" = $1)` },
    { label: 'Superbill', sql: `DELETE FROM "Superbill" WHERE "clinicId" = $1` },
    { label: 'BillingCode', sql: `DELETE FROM "BillingCode" WHERE "clinicId" = $1` },

    // --- Tickets ---
    { label: 'TicketSLA', sql: `DELETE FROM "TicketSLA" WHERE "ticketId" IN (SELECT id FROM "Ticket" WHERE "clinicId" = $1)` },
    { label: 'TicketEscalation', sql: `DELETE FROM "TicketEscalation" WHERE "ticketId" IN (SELECT id FROM "Ticket" WHERE "clinicId" = $1)` },
    { label: 'TicketWorkLog', sql: `DELETE FROM "TicketWorkLog" WHERE "ticketId" IN (SELECT id FROM "Ticket" WHERE "clinicId" = $1)` },
    { label: 'TicketStatusHistory', sql: `DELETE FROM "TicketStatusHistory" WHERE "ticketId" IN (SELECT id FROM "Ticket" WHERE "clinicId" = $1)` },
    { label: 'TicketComment', sql: `DELETE FROM "TicketComment" WHERE "ticketId" IN (SELECT id FROM "Ticket" WHERE "clinicId" = $1)` },
    { label: 'TicketAssignment', sql: `DELETE FROM "TicketAssignment" WHERE "ticketId" IN (SELECT id FROM "Ticket" WHERE "clinicId" = $1)` },
    { label: 'Ticket', sql: `DELETE FROM "Ticket" WHERE "clinicId" = $1` },
    { label: 'TicketTeam', sql: `DELETE FROM "TicketTeam" WHERE "clinicId" = $1` },
    { label: 'SlaPolicyConfig', sql: `DELETE FROM "SlaPolicyConfig" WHERE "clinicId" = $1` },
    { label: 'TicketBusinessHours', sql: `DELETE FROM "TicketBusinessHours" WHERE "clinicId" = $1` },
    { label: 'TicketMacro', sql: `DELETE FROM "TicketMacro" WHERE "clinicId" = $1` },
    { label: 'TicketTemplate', sql: `DELETE FROM "TicketTemplate" WHERE "clinicId" = $1` },
    { label: 'TicketAutomationRule', sql: `DELETE FROM "TicketAutomationRule" WHERE "clinicId" = $1` },
    { label: 'TicketSavedView', sql: `DELETE FROM "TicketSavedView" WHERE "clinicId" = $1` },

    // --- AI ---
    { label: 'AIMessage', sql: `DELETE FROM "AIMessage" WHERE "conversationId" IN (SELECT id FROM "AIConversation" WHERE "clinicId" = $1)` },
    { label: 'AIConversation', sql: `DELETE FROM "AIConversation" WHERE "clinicId" = $1` },

    // --- SOAP Notes (referenced by PatientDocument) ---
    { label: 'SOAPNoteRevision', sql: `DELETE FROM "SOAPNoteRevision" WHERE "soapNoteId" IN (SELECT id FROM "SOAPNote" WHERE "clinicId" = $1)` },
    { label: 'SOAPNote', sql: `DELETE FROM "SOAPNote" WHERE "clinicId" = $1` },

    // --- Lab Reports (child of PatientDocument) ---
    { label: 'LabReport', sql: `DELETE FROM "LabReport" WHERE "clinicId" = $1` },

    // --- Patient documents (clinicId is nullable, so also use patientId) ---
    { label: 'PatientDocument', sql: `DELETE FROM "PatientDocument" WHERE "patientId" IN ${PQ}` },

    // --- SMS ---
    { label: 'SmsLog', sql: `DELETE FROM "SmsLog" WHERE "clinicId" = $1` },
    { label: 'SmsOptOut', sql: `DELETE FROM "SmsOptOut" WHERE "clinicId" = $1` },
    { label: 'SmsQuietHours', sql: `DELETE FROM "SmsQuietHours" WHERE "clinicId" = $1` },
    { label: 'SmsRateLimit', sql: `DELETE FROM "SmsRateLimit" WHERE "clinicId" = $1` },

    // --- Affiliate system ---
    { label: 'AffiliateCommissionEvent', sql: `DELETE FROM "AffiliateCommissionEvent" WHERE "clinicId" = $1` },
    { label: 'AffiliatePlanAssignment', sql: `DELETE FROM "AffiliatePlanAssignment" WHERE "clinicId" = $1` },
    { label: 'AffiliateCommissionPlan', sql: `DELETE FROM "AffiliateCommissionPlan" WHERE "clinicId" = $1` },
    { label: 'AffiliateRefCode', sql: `DELETE FROM "AffiliateRefCode" WHERE "clinicId" = $1` },
    { label: 'AffiliateTouch', sql: `DELETE FROM "AffiliateTouch" WHERE "clinicId" = $1` },
    { label: 'AffiliateAttributionConfig', sql: `DELETE FROM "AffiliateAttributionConfig" WHERE "clinicId" = $1` },
    { label: 'AffiliatePayout', sql: `DELETE FROM "AffiliatePayout" WHERE "clinicId" = $1` },
    { label: 'AffiliateFraudAlert', sql: `DELETE FROM "AffiliateFraudAlert" WHERE "clinicId" = $1` },
    { label: 'AffiliateFraudConfig', sql: `DELETE FROM "AffiliateFraudConfig" WHERE "clinicId" = $1` },
    { label: 'AffiliateCompetition', sql: `DELETE FROM "AffiliateCompetition" WHERE "clinicId" = $1` },
    { label: 'AffiliateCommission', sql: `DELETE FROM "AffiliateCommission" WHERE "clinicId" = $1` },
    { label: 'AffiliateApplication', sql: `DELETE FROM "AffiliateApplication" WHERE "clinicId" = $1` },
    { label: 'Affiliate', sql: `DELETE FROM "Affiliate" WHERE "clinicId" = $1` },
    { label: 'AffiliateProgram', sql: `DELETE FROM "AffiliateProgram" WHERE "clinicId" = $1` },

    // --- Influencer/Referral (legacy) ---
    { label: 'CommissionPayout', sql: `DELETE FROM "CommissionPayout" WHERE "commissionId" IN (SELECT id FROM "Commission" WHERE "clinicId" = $1)` },
    { label: 'Commission', sql: `DELETE FROM "Commission" WHERE "clinicId" = $1` },
    { label: 'ReferralTracking', sql: `DELETE FROM "ReferralTracking" WHERE "clinicId" = $1` },
    { label: 'InfluencerBankAccount', sql: `DELETE FROM "InfluencerBankAccount" WHERE "influencerId" IN (SELECT id FROM "Influencer" WHERE "clinicId" = $1)` },
    { label: 'Influencer', sql: `DELETE FROM "Influencer" WHERE "clinicId" = $1` },

    // --- Orders & Prescriptions ---
    { label: 'Rx', sql: `DELETE FROM "Rx" WHERE "orderId" IN ${OQ}` },
    { label: 'OrderEvent', sql: `DELETE FROM "OrderEvent" WHERE "orderId" IN ${OQ}` },
    { label: 'Order', sql: `DELETE FROM "Order" WHERE "clinicId" = $1` },

    // --- Payments & Billing (delete by patientId since clinicId can be NULL on some) ---
    { label: 'PaymentReconciliation', sql: `DELETE FROM "PaymentReconciliation" WHERE "patientId" IN ${PQ}` },
    { label: 'Payment (by patient)', sql: `DELETE FROM "Payment" WHERE "patientId" IN ${PQ}` },
    { label: 'Payment (by clinic)', sql: `DELETE FROM "Payment" WHERE "clinicId" = $1` },
    { label: 'Invoice (by patient)', sql: `DELETE FROM "Invoice" WHERE "patientId" IN ${PQ}` },
    { label: 'Invoice (by clinic)', sql: `DELETE FROM "Invoice" WHERE "clinicId" = $1` },
    { label: 'Subscription (by patient)', sql: `DELETE FROM "Subscription" WHERE "patientId" IN ${PQ}` },
    { label: 'Subscription (by clinic)', sql: `DELETE FROM "Subscription" WHERE "clinicId" = $1` },
    { label: 'PaymentMethod (by patient)', sql: `DELETE FROM "PaymentMethod" WHERE "patientId" IN ${PQ}` },
    { label: 'PaymentMethod (by clinic)', sql: `DELETE FROM "PaymentMethod" WHERE "clinicId" = $1` },

    // --- Patient audit, portal, notes ---
    { label: 'PatientAudit', sql: `DELETE FROM "PatientAudit" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientPortalInvite', sql: `DELETE FROM "PatientPortalInvite" WHERE "patientId" IN ${PQ}` },
    { label: 'PatientNote', sql: `DELETE FROM "PatientNote" WHERE "patientId" IN ${PQ}` },
    { label: 'SalesRepDisposition', sql: `DELETE FROM "SalesRepDisposition" WHERE "patientId" IN ${PQ}` },
    { label: 'ShipmentLabel', sql: `DELETE FROM "ShipmentLabel" WHERE "patientId" IN ${PQ}` },
    { label: 'PackagePhoto', sql: `DELETE FROM "PackagePhoto" WHERE "patientId" IN ${PQ}` },
    { label: 'ChallengeParticipant', sql: `DELETE FROM "ChallengeParticipant" WHERE "patientId" IN ${PQ}` },
    { label: 'IntakeFormDraft', sql: `DELETE FROM "IntakeFormDraft" WHERE "patientId" IN ${PQ}` },
    { label: 'PlatformFeeEvent (by patient)', sql: `DELETE FROM "PlatformFeeEvent" WHERE "patientId" IN ${PQ}` },

    // --- Products & Pricing ---
    { label: 'RetentionOffer', sql: `DELETE FROM "RetentionOffer" WHERE "clinicId" = $1` },
    { label: 'PricingRule', sql: `DELETE FROM "PricingRule" WHERE "clinicId" = $1` },
    { label: 'RxOrderSet', sql: `DELETE FROM "RxOrderSet" WHERE "clinicId" = $1` },
    { label: 'ProductBundle', sql: `DELETE FROM "ProductBundle" WHERE "clinicId" = $1` },
    { label: 'Promotion', sql: `DELETE FROM "Promotion" WHERE "clinicId" = $1` },
    { label: 'DiscountCode', sql: `DELETE FROM "DiscountCode" WHERE "clinicId" = $1` },
    { label: 'Product', sql: `DELETE FROM "Product" WHERE "clinicId" = $1` },

    // --- Telehealth ---
    { label: 'TelehealthSession', sql: `DELETE FROM "TelehealthSession" WHERE "clinicId" = $1` },
    { label: 'CalendarSubscription', sql: `DELETE FROM "CalendarSubscription" WHERE "clinicId" = $1` },

    // --- Financial (may not exist yet) ---
    { label: 'FinancialMetrics', sql: `DELETE FROM "FinancialMetrics" WHERE "clinicId" = $1` },
    { label: 'SavedReport', sql: `DELETE FROM "SavedReport" WHERE "clinicId" = $1` },
    { label: 'ReportExport', sql: `DELETE FROM "ReportExport" WHERE "clinicId" = $1` },

    // --- Provider routing/compensation ---
    { label: 'ProviderCompensationEvent', sql: `DELETE FROM "ProviderCompensationEvent" WHERE "clinicId" = $1` },
    { label: 'ProviderCompensationPlan', sql: `DELETE FROM "ProviderCompensationPlan" WHERE "clinicId" = $1` },
    { label: 'ProviderRoutingConfig', sql: `DELETE FROM "ProviderRoutingConfig" WHERE "clinicId" = $1` },

    // --- SOC2 / Policy ---
    { label: 'PolicyAcknowledgment', sql: `DELETE FROM "PolicyAcknowledgment" WHERE "clinicId" = $1` },

    // --- Notifications ---
    { label: 'Notification', sql: `DELETE FROM "Notification" WHERE "clinicId" = $1` },
    { label: 'EmailLog', sql: `DELETE FROM "EmailLog" WHERE "clinicId" = $1` },
    { label: 'ScheduledEmail', sql: `DELETE FROM "ScheduledEmail" WHERE "clinicId" = $1` },

    // --- Platform billing ---
    { label: 'PlatformFeeEvent', sql: `DELETE FROM "PlatformFeeEvent" WHERE "clinicId" = $1` },
    { label: 'ClinicPlatformInvoice', sql: `DELETE FROM "ClinicPlatformInvoice" WHERE "clinicId" = $1` },
    { label: 'ClinicPlatformFeeConfig', sql: `DELETE FROM "ClinicPlatformFeeConfig" WHERE "clinicId" = $1` },

    // --- Gamification ---
    { label: 'Challenge', sql: `DELETE FROM "Challenge" WHERE "clinicId" = $1` },
    { label: 'RefillQueue', sql: `DELETE FROM "RefillQueue" WHERE "clinicId" = $1` },

    // --- API & Webhooks ---
    { label: 'ApiUsageLog', sql: `DELETE FROM "ApiUsageLog" WHERE "apiKeyId" IN (SELECT id FROM "ApiKey" WHERE "clinicId" = $1)` },
    { label: 'ApiKey', sql: `DELETE FROM "ApiKey" WHERE "clinicId" = $1` },
    { label: 'WebhookDelivery', sql: `DELETE FROM "WebhookDelivery" WHERE "configId" IN (SELECT id FROM "WebhookConfig" WHERE "clinicId" = $1)` },
    { label: 'WebhookConfig', sql: `DELETE FROM "WebhookConfig" WHERE "clinicId" = $1` },
    { label: 'IntegrationLog', sql: `DELETE FROM "IntegrationLog" WHERE "integrationId" IN (SELECT id FROM "Integration" WHERE "clinicId" = $1)` },
    { label: 'Integration', sql: `DELETE FROM "Integration" WHERE "clinicId" = $1` },
    { label: 'WebhookLog', sql: `DELETE FROM "WebhookLog" WHERE "clinicId" = $1` },
    { label: 'InternalMessage', sql: `DELETE FROM "InternalMessage" WHERE "clinicId" = $1` },

    // --- Audit ---
    { label: 'ClinicAuditLog', sql: `DELETE FROM "ClinicAuditLog" WHERE "clinicId" = $1` },

    // --- Sales rep ---
    { label: 'PatientSalesRepAssignment', sql: `DELETE FROM "PatientSalesRepAssignment" WHERE "clinicId" = $1` },

    // --- Invite codes ---
    { label: 'ClinicInviteCode', sql: `DELETE FROM "ClinicInviteCode" WHERE "clinicId" = $1` },

    // --- Settings ---
    { label: 'SystemSettings', sql: `DELETE FROM "SystemSettings" WHERE "clinicId" = $1` },

    // --- Counter ---
    { label: 'PatientCounter', sql: `DELETE FROM "PatientCounter" WHERE "clinicId" = $1` },

    // --- User system (before Patient/Provider since User refs Patient/Provider) ---
    { label: 'PasswordResetToken', sql: `DELETE FROM "PasswordResetToken" WHERE "userId" IN ${UQ}` },
    { label: 'UserSession', sql: `DELETE FROM "UserSession" WHERE "userId" IN ${UQ}` },
    { label: 'UserAuditLog', sql: `DELETE FROM "UserAuditLog" WHERE "userId" IN ${UQ}` },
    { label: 'AuditLog', sql: `DELETE FROM "AuditLog" WHERE "userId" IN ${UQ}` },
    { label: 'UserClinic', sql: `DELETE FROM "UserClinic" WHERE "clinicId" = $1` },
    { label: 'ProviderClinic', sql: `DELETE FROM "ProviderClinic" WHERE "clinicId" = $1` },
    { label: 'ProviderAudit', sql: `DELETE FROM "ProviderAudit" WHERE "providerId" IN ${PVQ}` },

    // --- Nullify self-references ---
    { label: 'User.createdById (nullify)', sql: `UPDATE "User" SET "createdById" = NULL WHERE "clinicId" = $1` },
    { label: 'User.patientId (nullify)', sql: `UPDATE "User" SET "patientId" = NULL WHERE "clinicId" = $1` },

    // --- Top-level entities ---
    { label: 'User', sql: `DELETE FROM "User" WHERE "clinicId" = $1` },
    { label: 'Patient', sql: `DELETE FROM "Patient" WHERE "clinicId" = $1` },
    { label: 'Provider', sql: `DELETE FROM "Provider" WHERE "clinicId" = $1` },

    // --- Finally, the clinic itself ---
    { label: 'Clinic', sql: `DELETE FROM "Clinic" WHERE id = $1` },
  ];

  let totalDeleted = 0;

  for (const q of deleteQueries) {
    try {
      const result = await prisma.$executeRawUnsafe(q.sql, clinicId);
      if (result > 0) {
        console.log(`   ✓ ${q.label}: ${result} row(s)`);
        totalDeleted += result;
      }
    } catch (err: any) {
      if (err.code === 'P2010' && err.message?.includes('does not exist')) {
        // Table doesn't exist in this migration state — skip silently
      } else {
        console.log(`   ⚠ ${q.label}: ${err.message?.slice(0, 120)}`);
      }
    }
  }

  return totalDeleted;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     DELETE EON MEDICAL DUMMY CLINIC                      ║');
  console.log(`║     Mode: ${EXECUTE ? '🔴 EXECUTE (REAL DELETE)' : '🟢 DRY RUN (audit only)'}                   ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Step 1: Find the target clinic
  console.log('🔍 Looking for EON Medical clinic (subdomain: eonmedical)...\n');
  const clinic = await findTargetClinic();

  if (!clinic) {
    console.log('   ❌ No clinic found with subdomain "eonmedical" and admin "admin@eonmedical.com".');
    console.log('   The clinic may have already been deleted.\n');
    return;
  }

  // Safety check: NEVER delete protected clinics
  if (PROTECTED_CLINIC_IDS.includes(clinic.id)) {
    console.error(`   🛑 SAFETY ABORT: Clinic ID ${clinic.id} is PROTECTED (EONMeds). Will NOT delete.`);
    process.exit(1);
  }

  console.log(`   Found: ID=${clinic.id}, Name="${clinic.name}", Subdomain="${clinic.subdomain}"`);
  console.log(`   Admin: ${clinic.adminEmail}`);
  console.log(`   Status: ${clinic.status}`);
  console.log(`   Created: ${clinic.createdAt.toISOString()}`);
  console.log(`   Patients: ${clinic._count.patients}, Providers: ${clinic._count.providers}`);
  console.log(`   Users: ${clinic._count.users}, Orders: ${clinic._count.orders}`);

  // Step 2: Audit all related data
  await auditClinicData(clinic.id);

  // Step 3: Verify this is NOT EONMeds
  if (clinic.name === 'EONMeds' || clinic.subdomain === 'eonmeds' || clinic.adminEmail === 'italo@eonmeds.com') {
    console.error('\n   🛑 SAFETY ABORT: This looks like EONMeds! Will NOT delete.');
    process.exit(1);
  }

  if (!EXECUTE) {
    console.log('\n─── DRY RUN COMPLETE ───');
    console.log('No data was modified. To actually delete, run:');
    console.log('  npx tsx scripts/delete-eon-medical-clinic.ts --execute\n');
    return;
  }

  // Step 4: Execute deletion
  console.log('\n⚠️  EXECUTING DELETION...');
  const totalDeleted = await deleteClinicData(clinic.id);

  // Step 5: Verify
  const verifyClinic = await prisma.clinic.findFirst({ where: { subdomain: 'eonmedical' } });
  if (verifyClinic) {
    console.error('\n   ❌ VERIFICATION FAILED: Clinic still exists!');
    process.exit(1);
  }

  // Verify EONMeds is untouched
  const eonmeds = await prisma.clinic.findUnique({
    where: { id: 3 },
    select: { id: true, name: true, subdomain: true, _count: { select: { patients: true } } },
  });
  if (!eonmeds) {
    console.error('\n   🛑 CRITICAL: EONMeds (ID 3) is MISSING! Something went very wrong.');
    process.exit(1);
  }

  console.log(`\n✅ DELETION COMPLETE — ${totalDeleted} total rows removed.`);
  console.log(`\n🔒 EONMeds verification: ID=${eonmeds.id}, "${eonmeds.name}", ${eonmeds._count.patients} patients — INTACT\n`);
}

main()
  .catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
