/**
 * Clinic Isolation Configuration
 * ==============================
 *
 * Defines which Prisma models require automatic clinicId filtering
 * and which models are permitted for use with the unfiltered basePrisma client.
 *
 * Extracted from db.ts to reduce blast radius of changes to the
 * tenant isolation configuration.
 *
 * @see tests/tenant-isolation/clinic-isolated-models.test.ts
 * @module lib/db/clinic-isolation-config
 */

/**
 * Models that require clinic isolation (lowercase for comparison).
 * MUST include every Prisma model that has a clinicId column.
 */
export const CLINIC_ISOLATED_MODELS: readonly string[] = [
  'addressvalidationlog',
  'affiliate',
  'affiliateapplication',
  'affiliateattributionconfig',
  'affiliatecommission',
  'affiliatecommissionevent',
  'affiliatecommissionplan',
  'affiliatecompetition',
  'affiliatefraudalert',
  'affiliatefraudconfig',
  'affiliatepayout',
  'affiliateplanassignment',
  'affiliateprogram',
  'affiliaterefcode',
  'affiliatereferral',
  'affiliatetouch',
  'aiconversation',
  'apikey',
  'appointment',
  'appointmenttypeconfig',
  'auditlog',
  'billingcode',
  'calendarsubscription',
  'careplan',
  'careplantemplate',
  'challenge',
  'clinicauditlog',
  'clinicinvitecode',
  'clinicplatformfeeconfig',
  'clinicplatforminvoice',
  'commission',
  'discountcode',
  'employeesalary',
  'emaillog',
  'financialmetrics',
  'hipaaauditentry',
  'influencer',
  'intakeformlink',
  'intakeformresponse',
  'intakeformsubmission',
  'intakeformtemplate',
  'integration',
  'internalmessage',
  'invoice',
  'labreport',
  'loginaudit',
  'notification',
  'order',
  // 'packagephoto' — intentionally NOT clinic-isolated; package photos are global
  // so LifeFile IDs can be matched across all clinics. clinicId is still stored for audit.
  'patient',
  'patientchatmessage',
  'patientcounter',
  'patientmedicationreminder',
  'patientdeviceconnection',
  'patientdocument',
  'patientexerciselog',
  'patientnutritionlog',
  'patientphoto',
  'patientprescriptioncycle',
  'patientsalesrepassignment',
  'salesrepcommissionevent',
  'salesrepcommissionplan',
  'salesrepplanassignment',
  'patientshippingupdate',
  'patientweightlog',
  'patientsleeplog',
  'patientwaterlog',
  'payment',
  'paymentmethod',
  'paymentreconciliation',
  'platformfeeevent',
  'policyacknowledgment',
  'pricingrule',
  'product',
  'productbundle',
  'promotion',
  'provider',
  'provideravailability',
  'providercalendarintegration',
  'providerclinic',
  'providercompensationevent',
  'providercompensationplan',
  'providerdateoverride',
  'providerroutingconfig',
  'providertimeoff',
  'referraltracking',
  'refillqueue',
  'reportexport',
  'rxorderset',
  'retentionoffer',
  'savedreport',
  'scheduledpayment',
  'scheduledemail',
  'slapolicyconfig',
  'smslog',
  'smsoptout',
  'smsquiethours',
  'smsratelimit',
  'soapnote',
  'subscription',
  'superbill',
  'systemsettings',
  'telehealthsession',
  'ticket',
  'ticketautomationrule',
  'ticketbusinesshours',
  'ticketmacro',
  'ticketsavedview',
  'ticketteam',
  'tickettemplate',
  'user',
  'userclinic',
  'webhookconfig',
  'webhooklog',
] as const;

/**
 * Allow-list for basePrisma: only these models may be used with the unfiltered client.
 * All other tenant-scoped access MUST use prisma (wrapper) with runWithClinicContext.
 *
 * - clinic: tenant lookup (resolve, auth)
 * - user: auth (login, session)
 * - userClinic, providerClinic: auth / clinic access checks
 * - provider: auth login (lookup by email before clinic is set)
 * - hIPAAAuditEntry: audit write (cross-clinic for super-admin; write-only)
 * - patient: webhook/cron lookup by non-tenant key (e.g. phone) to resolve clinicId only
 * - affiliate*, platformfeeevent: super-admin cross-tenant only (guarded by withSuperAdminAuth)
 */
export const BASE_PRISMA_ALLOWLIST: readonly string[] = [
  'clinic',
  'user',
  'userclinic',
  'providerclinic',
  'provider',
  'patient',
  'hipaaauditentry',
  'affiliate',
  'affiliateapplication',
  'affiliatecommissionevent',
  'affiliatecommissionplan',
  'affiliateplanassignment',
  'affiliatetouch',
  'affiliaterefcode',
  'platformfeeevent',
  'clinicplatforminvoice',
  'clinicplatformfeeconfig',
  'invoice',
  'payment',
  'paymentreconciliation',
  'salesrepcommissionevent',
  'scheduledemail',
  'internalmessage',
  'salesreprefcode',
  'salesrepcommissionplan',
  'salesrepplanassignment',
  'patientphoto',
  'patientshippingupdate',
  'order',
  'shipmentlabel',
  'emaillog',
];
