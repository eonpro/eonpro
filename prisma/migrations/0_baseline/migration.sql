-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InfluencerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "PayoutFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CONVERTED', 'ACTIVE', 'CHURNED');

-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('ACTIVE', 'PAUSED', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AffiliateApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommissionPlanType" AS ENUM ('FLAT', 'PERCENT');

-- CreateEnum
CREATE TYPE "CommissionAppliesTo" AS ENUM ('FIRST_PAYMENT_ONLY', 'ALL_PAYMENTS');

-- CreateEnum
CREATE TYPE "CommissionEventStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "CompetitionMetric" AS ENUM ('CLICKS', 'CONVERSIONS', 'REVENUE', 'CONVERSION_RATE', 'NEW_CUSTOMERS');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TouchType" AS ENUM ('CLICK', 'IMPRESSION', 'POSTBACK');

-- CreateEnum
CREATE TYPE "AttributionModel" AS ENUM ('FIRST_CLICK', 'LAST_CLICK', 'LINEAR', 'TIME_DECAY', 'POSITION');

-- CreateEnum
CREATE TYPE "PayoutMethodType" AS ENUM ('STRIPE_CONNECT', 'PAYPAL', 'BANK_WIRE', 'CHECK', 'MANUAL');

-- CreateEnum
CREATE TYPE "AffiliatePayoutStatus" AS ENUM ('PENDING', 'SCHEDULED', 'AWAITING_APPROVAL', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "TaxDocumentType" AS ENUM ('W9', 'W8BEN', 'W8BENE');

-- CreateEnum
CREATE TYPE "TaxDocumentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FraudAlertType" AS ENUM ('SELF_REFERRAL', 'DUPLICATE_IP', 'VELOCITY_SPIKE', 'SUSPICIOUS_PATTERN', 'GEO_MISMATCH', 'REFUND_ABUSE', 'COOKIE_STUFFING', 'CLICK_FRAUD', 'DEVICE_FRAUD', 'INCENTIVIZED_TRAFFIC');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FraudAlertStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "FraudResolutionAction" AS ENUM ('NO_ACTION', 'WARNING_ISSUED', 'COMMISSION_REVERSED', 'COMMISSIONS_HELD', 'AFFILIATE_SUSPENDED', 'AFFILIATE_TERMINATED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "AppointmentModeType" AS ENUM ('IN_PERSON', 'VIDEO', 'PHONE');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('EMAIL', 'SMS', 'BOTH');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TelehealthSessionStatus" AS ENUM ('SCHEDULED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'TECHNICAL_ISSUES');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PROVIDER', 'INFLUENCER', 'AFFILIATE', 'PATIENT', 'STAFF', 'SUPPORT', 'SALES_REP', 'PHARMACY_REP');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'LOCKED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'CREATED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('SERVICE', 'MEDICATION', 'SUPPLEMENT', 'LAB_TEST', 'PROCEDURE', 'PACKAGE', 'MEMBERSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'FREE_TRIAL', 'BUY_X_GET_Y');

-- CreateEnum
CREATE TYPE "DiscountApplyTo" AS ENUM ('ALL_PRODUCTS', 'LIMITED_PRODUCTS', 'LIMITED_CATEGORIES', 'SUBSCRIPTIONS_ONLY', 'ONE_TIME_ONLY');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('SALE', 'FLASH_SALE', 'SEASONAL', 'CLEARANCE', 'NEW_PATIENT', 'LOYALTY', 'BUNDLE', 'UPGRADE');

-- CreateEnum
CREATE TYPE "PricingRuleType" AS ENUM ('VOLUME_DISCOUNT', 'TIERED_PRICING', 'PATIENT_SEGMENT', 'LOYALTY_DISCOUNT', 'TIME_BASED', 'LOCATION_BASED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PaymentVerificationMethod" AS ENUM ('STRIPE_AUTO', 'MANUAL_VERIFIED', 'EXTERNAL_REFERENCE', 'PAYMENT_SKIPPED');

-- CreateEnum
CREATE TYPE "ScheduledPaymentType" AS ENUM ('AUTO_CHARGE', 'REMINDER');

-- CreateEnum
CREATE TYPE "ScheduledPaymentStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TRIAL', 'EXPIRED', 'PENDING_SETUP');

-- CreateEnum
CREATE TYPE "RoutingStrategy" AS ENUM ('STATE_LICENSE_MATCH', 'ROUND_ROBIN', 'MANUAL_ASSIGNMENT', 'PROVIDER_CHOICE');

-- CreateEnum
CREATE TYPE "SoapApprovalMode" AS ENUM ('REQUIRED', 'ADVISORY', 'DISABLED');

-- CreateEnum
CREATE TYPE "SOAPNoteStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'LOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SOAPSourceType" AS ENUM ('MANUAL', 'MEDLINK_INTAKE', 'AI_GENERATED', 'TELEHEALTH_SCRIBE', 'IMPORTED', 'INVOICE_METADATA');

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('PENDING', 'LABEL_CREATED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'EXCEPTION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefillStatus" AS ENUM ('SCHEDULED', 'PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER', 'PRESCRIBED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('SUCCESS', 'ERROR', 'INVALID_AUTH', 'INVALID_PAYLOAD', 'PROCESSING_ERROR');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "InternalMessageType" AS ENUM ('DIRECT', 'BROADCAST', 'CHANNEL', 'ALERT');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WEB', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('PATIENT', 'STAFF', 'PROVIDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('PRESCRIPTION', 'PATIENT', 'ORDER', 'SYSTEM', 'APPOINTMENT', 'MESSAGE', 'PAYMENT', 'REFILL', 'SHIPMENT');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "ScheduledEmailStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'LEAD', 'PENDING_COMPLETION', 'MERGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PatientDocumentCategory" AS ENUM ('MEDICAL_INTAKE_FORM', 'MEDICAL_RECORDS', 'LAB_RESULTS', 'INSURANCE', 'CONSENT_FORMS', 'PRESCRIPTIONS', 'IMAGING', 'ID_PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "PatientPhotoType" AS ENUM ('PROGRESS_FRONT', 'PROGRESS_SIDE', 'PROGRESS_BACK', 'ID_FRONT', 'ID_BACK', 'SELFIE', 'MEDICAL_SKIN', 'MEDICAL_INJURY', 'MEDICAL_SYMPTOM', 'MEDICAL_BEFORE', 'MEDICAL_AFTER', 'MEDICAL_OTHER', 'PROFILE_AVATAR');

-- CreateEnum
CREATE TYPE "PatientPhotoVerificationStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PharmacyInvoiceStatus" AS ENUM ('PENDING', 'PARSING', 'PARSED', 'MATCHING', 'RECONCILED', 'ERROR');

-- CreateEnum
CREATE TYPE "PharmacyInvoiceLineType" AS ENUM ('MEDICATION', 'SUPPLY', 'SHIPPING_CARRIER', 'SHIPPING_FEE');

-- CreateEnum
CREATE TYPE "PharmacyPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "PharmacyInvoiceMatchStatus" AS ENUM ('PENDING', 'MATCHED', 'UNMATCHED', 'DISCREPANCY', 'MANUALLY_MATCHED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PlatformFeeType" AS ENUM ('PRESCRIPTION', 'TRANSMISSION', 'ADMIN');

-- CreateEnum
CREATE TYPE "PlatformFeeStatus" AS ENUM ('PENDING', 'INVOICED', 'PAID', 'WAIVED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PlatformFeeCalculationType" AS ENUM ('FLAT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "PlatformAdminFeeType" AS ENUM ('NONE', 'FLAT_WEEKLY', 'PERCENTAGE_WEEKLY');

-- CreateEnum
CREATE TYPE "ClinicInvoicePeriodType" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ClinicInvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'APPLIED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CompensationEventStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "CompensationType" AS ENUM ('FLAT_RATE', 'PERCENTAGE', 'HYBRID');

-- CreateEnum
CREATE TYPE "DispositionLeadSource" AS ENUM ('REF_LINK', 'COLD_CALL', 'WALK_IN', 'SOCIAL_MEDIA', 'TEXT_MESSAGE', 'EMAIL_CAMPAIGN', 'WORD_OF_MOUTH', 'EXISTING_PATIENT', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DispositionContactMethod" AS ENUM ('PHONE', 'TEXT', 'EMAIL', 'IN_PERSON', 'VIDEO_CALL', 'SOCIAL_DM', 'OTHER');

-- CreateEnum
CREATE TYPE "DispositionOutcome" AS ENUM ('SALE_COMPLETED', 'INTERESTED', 'CALLBACK_REQUESTED', 'NOT_INTERESTED', 'NO_ANSWER', 'WRONG_NUMBER', 'ALREADY_PATIENT', 'DO_NOT_CONTACT', 'OTHER');

-- CreateEnum
CREATE TYPE "DispositionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELED', 'PAST_DUE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionActionType" AS ENUM ('CREATED', 'ACTIVATED', 'PAUSED', 'RESUMED', 'UPGRADED', 'DOWNGRADED', 'CANCELLED', 'REACTIVATED', 'PAYMENT_FAILED', 'PAYMENT_SUCCEEDED', 'RETENTION_OFFERED', 'RETENTION_ACCEPTED', 'RETENTION_DECLINED');

-- CreateEnum
CREATE TYPE "RetentionOfferType" AS ENUM ('DISCOUNT', 'FREE_PERIOD', 'PAUSE', 'DOWNGRADE', 'BONUS');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('P5_PLANNING', 'P4_LOW', 'P3_MEDIUM', 'P2_HIGH', 'P1_URGENT', 'P0_CRITICAL', 'LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'OPEN', 'IN_PROGRESS', 'PENDING', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'ON_HOLD', 'ESCALATED', 'RESOLVED', 'CLOSED', 'CANCELLED', 'REOPENED');

-- CreateEnum
CREATE TYPE "TicketDisposition" AS ENUM ('RESOLVED_SUCCESSFULLY', 'RESOLVED_WITH_WORKAROUND', 'NOT_RESOLVED', 'DUPLICATE', 'NOT_REPRODUCIBLE', 'BY_DESIGN', 'CUSTOMER_ERROR', 'TRAINING_ISSUE', 'REFERRED_TO_SPECIALIST', 'PENDING_CUSTOMER', 'CANCELLED_BY_CUSTOMER');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('PATIENT_ISSUE', 'PATIENT_COMPLAINT', 'PATIENT_REQUEST', 'ORDER_ISSUE', 'ORDER_MODIFICATION', 'SHIPPING_ISSUE', 'REFUND_REQUEST', 'PRESCRIPTION', 'PRESCRIPTION_ISSUE', 'PROVIDER_INQUIRY', 'CLINICAL_QUESTION', 'MEDICATION_QUESTION', 'SIDE_EFFECTS', 'DOSAGE', 'REFILL', 'SYSTEM_BUG', 'FEATURE_REQUEST', 'ACCESS_ISSUE', 'INTEGRATION_ERROR', 'TECHNICAL_ISSUE', 'PORTAL_ACCESS', 'BILLING', 'BILLING_ISSUE', 'COMPLIANCE_ISSUE', 'DATA_CORRECTION', 'ACCOUNT_ISSUE', 'INSURANCE', 'APPOINTMENT', 'SCHEDULING_ISSUE', 'GENERAL', 'GENERAL_INQUIRY', 'FEEDBACK', 'DELIVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketAction" AS ENUM ('CREATED', 'ASSIGNED', 'REASSIGNED', 'STARTED_WORK', 'STOPPED_WORK', 'ADDED_COMMENT', 'UPDATED_STATUS', 'ESCALATED', 'DE_ESCALATED', 'REQUESTED_INFO', 'PROVIDED_INFO', 'RESEARCHED', 'CONTACTED_PATIENT', 'CONTACTED_PROVIDER', 'CONTACTED_PHARMACY', 'CONTACTED_INSURANCE', 'APPLIED_SOLUTION', 'TESTED_SOLUTION', 'RESOLVED', 'REOPENED', 'CLOSED', 'MERGED', 'SPLIT', 'PRIORITY_CHANGED', 'CATEGORY_CHANGED', 'ATTACHMENT_ADDED', 'WATCHER_ADDED', 'WATCHER_REMOVED', 'LINKED', 'UNLINKED', 'SLA_BREACH_WARNING', 'SLA_BREACHED', 'AUTO_ASSIGNED', 'AUTO_ESCALATED', 'AUTO_CLOSED', 'MENTIONED', 'TIME_LOGGED');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('INTERNAL', 'PATIENT_PORTAL', 'PHONE', 'EMAIL', 'CHAT', 'FORM', 'SYSTEM', 'API');

-- CreateEnum
CREATE TYPE "TicketActivityType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'CATEGORY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'REASSIGNED', 'ESCALATED', 'COMMENT_ADDED', 'INTERNAL_NOTE_ADDED', 'ATTACHMENT_ADDED', 'RESOLVED', 'REOPENED', 'CLOSED', 'LINKED', 'UNLINKED', 'MERGED', 'SPLIT', 'SLA_BREACH_WARNING', 'SLA_BREACHED', 'SLA_PAUSED', 'SLA_RESUMED', 'AUTO_ASSIGNED', 'AUTO_ESCALATED', 'AUTO_CLOSED', 'AUTOMATION_TRIGGERED', 'WATCHER_ADDED', 'WATCHER_REMOVED', 'MENTIONED', 'VIEWED', 'LOCKED', 'UNLOCKED', 'TIME_LOGGED');

-- CreateEnum
CREATE TYPE "SlaMetricType" AS ENUM ('FIRST_RESPONSE', 'RESOLUTION', 'NEXT_RESPONSE');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('ON_CREATE', 'ON_UPDATE', 'ON_STATUS_CHANGE', 'ON_ASSIGNMENT', 'ON_PRIORITY_CHANGE', 'ON_CATEGORY_CHANGE', 'ON_COMMENT_ADDED', 'ON_SLA_WARNING', 'ON_SLA_BREACH', 'ON_NO_ACTIVITY', 'ON_REOPEN', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('SET_PRIORITY', 'SET_STATUS', 'SET_CATEGORY', 'ADD_TAG', 'REMOVE_TAG', 'ASSIGN_TO_USER', 'ASSIGN_TO_TEAM', 'ADD_WATCHER', 'SEND_NOTIFICATION', 'SEND_EMAIL', 'ADD_COMMENT', 'ADD_INTERNAL_NOTE', 'ESCALATE', 'CLOSE_TICKET', 'APPLY_MACRO');

-- CreateEnum
CREATE TYPE "StreakType" AS ENUM ('DAILY_CHECK_IN', 'WEIGHT_LOG', 'WATER_LOG', 'EXERCISE_LOG', 'MEAL_LOG', 'MEDICATION_TAKEN', 'SLEEP_LOG');

-- CreateEnum
CREATE TYPE "AchievementCategory" AS ENUM ('GETTING_STARTED', 'CONSISTENCY', 'WEIGHT_LOSS', 'HEALTH_TRACKING', 'ENGAGEMENT', 'MILESTONES', 'SPECIAL');

-- CreateEnum
CREATE TYPE "AchievementTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');

-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('STREAK', 'CUMULATIVE', 'MILESTONE', 'COMPETITION');

-- CreateTable
CREATE TABLE "Influencer" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "promoCode" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "status" "InfluencerStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "lastLogin" TIMESTAMP(3),
    "phone" TEXT,
    "paypalEmail" TEXT,
    "preferredPaymentMethod" TEXT DEFAULT 'paypal',
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Influencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfluencerBankAccount" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "influencerId" INTEGER NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "routingNumber" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'checking',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InfluencerBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralTracking" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "influencerId" INTEGER NOT NULL,
    "promoCode" TEXT NOT NULL,
    "referralSource" TEXT,
    "referralExpiresAt" TIMESTAMP(3) NOT NULL,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "convertedAt" TIMESTAMP(3),
    "conversionInvoiceId" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "ReferralTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "influencerId" INTEGER NOT NULL,
    "referralId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "orderAmount" INTEGER NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "payoutId" INTEGER,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "influencerId" INTEGER NOT NULL,
    "payoutMethod" TEXT NOT NULL,
    "payoutReference" TEXT,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateProgram" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Affiliate Program',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultCommissionType" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "defaultCommissionValue" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "commissionOnFirstPurchase" BOOLEAN NOT NULL DEFAULT true,
    "commissionOnRecurring" BOOLEAN NOT NULL DEFAULT true,
    "recurringCommissionDuration" INTEGER,
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
    "minimumPayout" INTEGER NOT NULL DEFAULT 5000,
    "payoutFrequency" "PayoutFrequency" NOT NULL DEFAULT 'MONTHLY',

    CONSTRAINT "AffiliateProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateTier" (
    "id" SERIAL NOT NULL,
    "programId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "minReferrals" INTEGER NOT NULL DEFAULT 0,
    "minRevenue" INTEGER NOT NULL DEFAULT 0,
    "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "commissionValue" DOUBLE PRECISION NOT NULL,
    "bonusAmount" INTEGER,
    "perks" JSONB,

    CONSTRAINT "AffiliateTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateReferral" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "referredPatientId" INTEGER NOT NULL,
    "discountCodeUsed" TEXT,
    "landingPage" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "convertedAt" TIMESTAMP(3),
    "totalRevenue" INTEGER NOT NULL DEFAULT 0,
    "totalCommission" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "referralId" INTEGER,
    "invoiceId" INTEGER,
    "orderId" INTEGER,
    "subscriptionId" INTEGER,
    "orderAmount" INTEGER NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "payoutId" TEXT,
    "commissionType" TEXT NOT NULL DEFAULT 'first_purchase',

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "currentTierId" INTEGER,
    "tierQualifiedAt" TIMESTAMP(3),
    "lifetimeConversions" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false,
    "leaderboardAlias" TEXT,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateOtpCode" (
    "id" SERIAL NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateOtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateApplication" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "socialProfiles" JSONB NOT NULL,
    "website" TEXT,
    "audienceSize" TEXT,
    "promotionPlan" TEXT,
    "status" "AffiliateApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" INTEGER,
    "reviewNotes" TEXT,
    "affiliateId" INTEGER,

    CONSTRAINT "AffiliateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateRefCode" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "refCode" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AffiliateRefCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommissionPlan" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "planType" "CommissionPlanType" NOT NULL DEFAULT 'PERCENT',
    "flatAmountCents" INTEGER,
    "percentBps" INTEGER,
    "appliesTo" "CommissionAppliesTo" NOT NULL DEFAULT 'FIRST_PAYMENT_ONLY',
    "holdDays" INTEGER NOT NULL DEFAULT 0,
    "clawbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "initialPercentBps" INTEGER,
    "initialFlatAmountCents" INTEGER,
    "recurringPercentBps" INTEGER,
    "recurringFlatAmountCents" INTEGER,
    "tierEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recurringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recurringMonths" INTEGER,
    "recurringDecayPct" INTEGER,

    CONSTRAINT "AffiliateCommissionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePlanAssignment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "commissionPlanId" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "AffiliatePlanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommissionEvent" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "stripeObjectId" TEXT NOT NULL,
    "stripeEventType" TEXT NOT NULL,
    "eventAmountCents" INTEGER NOT NULL,
    "commissionAmountCents" INTEGER NOT NULL,
    "commissionPlanId" INTEGER,
    "baseCommissionCents" INTEGER,
    "tierBonusCents" INTEGER,
    "promotionBonusCents" INTEGER,
    "productAdjustmentCents" INTEGER,
    "touchId" INTEGER,
    "attributionModel" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringMonth" INTEGER,
    "originalEventId" INTEGER,
    "status" "CommissionEventStatus" NOT NULL DEFAULT 'PENDING',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "holdUntil" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "payoutId" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "AffiliateCommissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCompetition" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" "CompetitionMetric" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "prizeDescription" TEXT,
    "prizeValueCents" INTEGER,
    "minParticipants" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AffiliateCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCompetitionEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,

    CONSTRAINT "AffiliateCompetitionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateTouch" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "visitorFingerprint" TEXT NOT NULL,
    "cookieId" TEXT,
    "ipAddressHash" TEXT,
    "userAgent" TEXT,
    "affiliateId" INTEGER NOT NULL,
    "refCode" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "subId1" TEXT,
    "subId2" TEXT,
    "subId3" TEXT,
    "subId4" TEXT,
    "subId5" TEXT,
    "landingPage" TEXT,
    "referrerUrl" TEXT,
    "touchType" "TouchType" NOT NULL DEFAULT 'CLICK',
    "convertedPatientId" INTEGER,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "AffiliateTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateAttributionConfig" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "newPatientModel" "AttributionModel" NOT NULL DEFAULT 'FIRST_CLICK',
    "returningPatientModel" "AttributionModel" NOT NULL DEFAULT 'LAST_CLICK',
    "cookieWindowDays" INTEGER NOT NULL DEFAULT 30,
    "impressionWindowHours" INTEGER NOT NULL DEFAULT 24,
    "enableFingerprinting" BOOLEAN NOT NULL DEFAULT true,
    "enableSubIds" BOOLEAN NOT NULL DEFAULT true,
    "maxSubIds" INTEGER NOT NULL DEFAULT 5,
    "crossDeviceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "viewThroughEnabled" BOOLEAN NOT NULL DEFAULT false,
    "viewThroughWindowHours" INTEGER NOT NULL DEFAULT 24,

    CONSTRAINT "AffiliateAttributionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommissionTier" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "minConversions" INTEGER NOT NULL DEFAULT 0,
    "minRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "minActiveMonths" INTEGER,
    "percentBps" INTEGER,
    "flatAmountCents" INTEGER,
    "bonusCents" INTEGER,
    "perks" JSONB,

    CONSTRAINT "AffiliateCommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateProductRate" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER NOT NULL,
    "productSku" TEXT,
    "productCategory" TEXT,
    "minPriceCents" INTEGER,
    "maxPriceCents" INTEGER,
    "percentBps" INTEGER,
    "flatAmountCents" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AffiliateProductRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePromotion" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "bonusPercentBps" INTEGER,
    "bonusFlatCents" INTEGER,
    "minOrderCents" INTEGER,
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "affiliateIds" JSONB,
    "refCodes" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AffiliatePromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePayoutMethod" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "methodType" "PayoutMethodType" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "stripeAccountId" TEXT,
    "stripeAccountStatus" TEXT,
    "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "paypalEmail" TEXT,
    "paypalPayerId" TEXT,
    "paypalVerified" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT,
    "bankAccountLast4" TEXT,
    "bankRoutingLast4" TEXT,
    "bankCountry" TEXT,
    "encryptedDetails" TEXT,
    "encryptionKeyId" TEXT,
    "mailingAddressLine1" TEXT,
    "mailingAddressLine2" TEXT,
    "mailingCity" TEXT,
    "mailingState" TEXT,
    "mailingZip" TEXT,
    "mailingCountry" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AffiliatePayoutMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePayout" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "netAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "methodType" "PayoutMethodType" NOT NULL,
    "status" "AffiliatePayoutStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "failureCode" TEXT,
    "stripeTransferId" TEXT,
    "stripePayoutId" TEXT,
    "paypalBatchId" TEXT,
    "paypalPayoutId" TEXT,
    "checkNumber" TEXT,
    "wireReference" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "processedBy" INTEGER,
    "approvedBy" INTEGER,
    "notes" TEXT,

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateTaxDocument" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "documentType" "TaxDocumentType" NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "s3Key" TEXT,
    "s3Bucket" TEXT,
    "encryptionKeyId" TEXT,
    "status" "TaxDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" INTEGER,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "taxIdLast4" TEXT,
    "taxIdType" TEXT,
    "legalName" TEXT,
    "businessName" TEXT,
    "taxClassification" TEXT,
    "address" TEXT,
    "tinMatchStatus" TEXT,
    "tinMatchedAt" TIMESTAMP(3),

    CONSTRAINT "AffiliateTaxDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateFraudAlert" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "affiliateId" INTEGER NOT NULL,
    "alertType" "FraudAlertType" NOT NULL,
    "severity" "FraudSeverity" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "commissionEventId" INTEGER,
    "touchId" INTEGER,
    "riskScore" INTEGER NOT NULL DEFAULT 50,
    "affectedAmountCents" INTEGER,
    "status" "FraudAlertStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,
    "resolution" TEXT,
    "resolutionAction" "FraudResolutionAction",

    CONSTRAINT "AffiliateFraudAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateIpIntel" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipHash" TEXT NOT NULL,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timezone" TEXT,
    "isp" TEXT,
    "organization" TEXT,
    "asn" TEXT,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "isVpn" BOOLEAN NOT NULL DEFAULT false,
    "isTor" BOOLEAN NOT NULL DEFAULT false,
    "isDatacenter" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "isCrawler" BOOLEAN NOT NULL DEFAULT false,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "fraudScore" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateIpIntel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateFraudConfig" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxConversionsPerDay" INTEGER NOT NULL DEFAULT 50,
    "maxConversionsPerHour" INTEGER NOT NULL DEFAULT 10,
    "velocitySpikeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "maxConversionsPerIp" INTEGER NOT NULL DEFAULT 3,
    "minIpRiskScore" INTEGER NOT NULL DEFAULT 75,
    "blockProxyVpn" BOOLEAN NOT NULL DEFAULT false,
    "blockDatacenter" BOOLEAN NOT NULL DEFAULT true,
    "blockTor" BOOLEAN NOT NULL DEFAULT true,
    "maxRefundRatePct" INTEGER NOT NULL DEFAULT 20,
    "minRefundsForAlert" INTEGER NOT NULL DEFAULT 5,
    "enableGeoMismatchCheck" BOOLEAN NOT NULL DEFAULT true,
    "allowedCountries" JSONB,
    "enableSelfReferralCheck" BOOLEAN NOT NULL DEFAULT true,
    "autoHoldOnHighRisk" BOOLEAN NOT NULL DEFAULT true,
    "autoSuspendOnCritical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AffiliateFraudConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentType" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 15,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresVideoLink" BOOLEAN NOT NULL DEFAULT false,
    "allowSelfScheduling" BOOLEAN NOT NULL DEFAULT true,
    "bufferBefore" INTEGER NOT NULL DEFAULT 0,
    "bufferAfter" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER,
    "intakeFormTemplateId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "appointmentTypeId" INTEGER,
    "title" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 15,
    "type" "AppointmentModeType" NOT NULL DEFAULT 'IN_PERSON',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "location" TEXT,
    "roomNumber" TEXT,
    "videoLink" TEXT,
    "zoomMeetingId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "rescheduledFromId" INTEGER,
    "rescheduledToId" INTEGER,
    "noShowAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "googleCalendarEventId" TEXT,
    "outlookCalendarEventId" TEXT,
    "appleCalendarEventId" TEXT,
    "zoomJoinUrl" TEXT,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentReminder" (
    "id" SERIAL NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "type" "ReminderType" NOT NULL DEFAULT 'BOTH',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "messageId" TEXT,
    "template" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Superbill" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "appointmentId" INTEGER,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "sentToPatient" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Superbill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperbillItem" (
    "id" SERIAL NOT NULL,
    "superbillId" INTEGER NOT NULL,
    "cptCode" TEXT NOT NULL,
    "cptDescription" TEXT NOT NULL,
    "icdCodes" TEXT[],
    "icdDescriptions" TEXT[],
    "modifier" TEXT,
    "units" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperbillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCode" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "codeType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultPrice" INTEGER,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelehealthSession" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "appointmentId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "meetingId" TEXT NOT NULL,
    "meetingUuid" TEXT,
    "joinUrl" TEXT NOT NULL,
    "hostUrl" TEXT,
    "password" TEXT,
    "topic" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 15,
    "actualDuration" INTEGER,
    "status" "TelehealthSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "platform" TEXT NOT NULL DEFAULT 'zoom',
    "recordingUrl" TEXT,
    "recordingPassword" TEXT,
    "recordingDuration" INTEGER,
    "recordingSize" BIGINT,
    "transcriptUrl" TEXT,
    "participantCount" INTEGER DEFAULT 0,
    "hostJoinedAt" TIMESTAMP(3),
    "patientJoinedAt" TIMESTAMP(3),
    "waitingRoomEnteredAt" TIMESTAMP(3),
    "waitingRoomAdmittedAt" TIMESTAMP(3),
    "technicalIssues" TEXT,
    "endReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelehealthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelehealthParticipant" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "participantId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "duration" INTEGER,
    "deviceType" TEXT,
    "ipAddress" TEXT,
    "location" TEXT,
    "connectionQuality" TEXT,
    "audioEnabled" BOOLEAN DEFAULT true,
    "videoEnabled" BOOLEAN DEFAULT true,
    "screenShared" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelehealthParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSubscription" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "token" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "includePatientNames" BOOLEAN NOT NULL DEFAULT false,
    "includeMeetingLinks" BOOLEAN NOT NULL DEFAULT true,
    "syncRangeDays" INTEGER NOT NULL DEFAULT 90,
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAudit" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerId" INTEGER NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "diff" JSONB,

    CONSTRAINT "ProviderAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAudit" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "diff" JSONB,

    CONSTRAINT "PatientAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" INTEGER,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "clinicId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HIPAAAuditEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "clinicId" INTEGER,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "patientId" INTEGER,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "sessionId" TEXT,
    "requestId" TEXT NOT NULL,
    "requestMethod" TEXT NOT NULL,
    "requestPath" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "hash" TEXT NOT NULL,
    "metadata" JSONB,
    "emergency" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HIPAAAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "activeClinicId" INTEGER,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "permissions" JSONB,
    "features" JSONB,
    "metadata" JSONB,
    "lastLogin" TIMESTAMP(3),
    "lastPasswordChange" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorBackupCodes" JSONB DEFAULT '[]',
    "twoFactorVerifiedAt" TIMESTAMP(3),
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailDigestFrequency" TEXT DEFAULT 'weekly',
    "lastEmailDigestSentAt" TIMESTAMP(3),
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER,
    "providerId" INTEGER,
    "influencerId" INTEGER,
    "patientId" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserClinic" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "role" "UserRole" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserClinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceFingerprint" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAudit" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "failureReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "clinicId" INTEGER,
    "deviceFingerprint" TEXT,
    "requestId" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicInviteCode" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "ClinicInviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPortalInvite" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "trigger" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPortalInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "userId" INTEGER,
    "patientId" INTEGER,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationCode" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeInvoiceId" TEXT,
    "stripeInvoiceNumber" TEXT,
    "stripeInvoiceUrl" TEXT,
    "stripePdfUrl" TEXT,
    "patientId" INTEGER NOT NULL,
    "description" TEXT,
    "amount" INTEGER,
    "amountDue" INTEGER,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "lineItems" JSONB,
    "metadata" JSONB,
    "orderId" INTEGER,
    "commissionGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createSubscription" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionCreated" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionProcessed" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionProcessedAt" TIMESTAMP(3),
    "prescriptionProcessedBy" INTEGER,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "stripeRefundId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "failureReason" TEXT,
    "refundedAmount" INTEGER,
    "refundedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "patientId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "subscriptionId" INTEGER,
    "description" TEXT,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeEventId" TEXT,
    "stripeEventType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "description" TEXT,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "matchedBy" TEXT,
    "matchConfidence" TEXT,
    "patientId" INTEGER,
    "invoiceId" INTEGER,
    "patientCreated" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encryptedCardNumber" TEXT,
    "cardLast4" TEXT NOT NULL,
    "cardBrand" TEXT,
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "cardholderName" TEXT,
    "encryptedCvv" TEXT,
    "billingZip" TEXT,
    "stripePaymentMethodId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "encryptionKeyId" TEXT,
    "fingerprint" TEXT,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "category" "ProductCategory" NOT NULL DEFAULT 'SERVICE',
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "billingType" "BillingType" NOT NULL DEFAULT 'ONE_TIME',
    "billingInterval" "BillingInterval",
    "billingIntervalCount" INTEGER NOT NULL DEFAULT 1,
    "trialDays" INTEGER,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "trackInventory" BOOLEAN NOT NULL DEFAULT false,
    "inventoryCount" INTEGER,
    "lowStockThreshold" INTEGER,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "taxRate" DOUBLE PRECISION,
    "metadata" JSONB,
    "tags" JSONB,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" INTEGER NOT NULL,
    "productId" INTEGER,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DOUBLE PRECISION NOT NULL,
    "applyTo" "DiscountApplyTo" NOT NULL DEFAULT 'ALL_PRODUCTS',
    "productIds" JSONB,
    "categoryIds" JSONB,
    "excludeProductIds" JSONB,
    "maxUses" INTEGER,
    "maxUsesPerPatient" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minOrderAmount" INTEGER,
    "minQuantity" INTEGER,
    "firstTimeOnly" BOOLEAN NOT NULL DEFAULT false,
    "applyToFirstPayment" BOOLEAN NOT NULL DEFAULT true,
    "applyToRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringDuration" INTEGER,
    "stripeCouponId" TEXT,
    "affiliateId" INTEGER,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountUsage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discountCodeId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "orderId" INTEGER,
    "amountSaved" INTEGER NOT NULL,
    "orderTotal" INTEGER NOT NULL,

    CONSTRAINT "DiscountUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "internalNotes" TEXT,
    "promotionType" "PromotionType" NOT NULL DEFAULT 'SALE',
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DOUBLE PRECISION NOT NULL,
    "applyTo" "DiscountApplyTo" NOT NULL DEFAULT 'ALL_PRODUCTS',
    "productIds" JSONB,
    "categoryIds" JSONB,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bannerText" TEXT,
    "bannerColor" TEXT,
    "showOnProducts" BOOLEAN NOT NULL DEFAULT true,
    "showBanner" BOOLEAN NOT NULL DEFAULT false,
    "maxRedemptions" INTEGER,
    "currentRedemptions" INTEGER NOT NULL DEFAULT 0,
    "autoApply" BOOLEAN NOT NULL DEFAULT true,
    "requiresCode" BOOLEAN NOT NULL DEFAULT false,
    "discountCodeId" INTEGER,
    "stripeCouponId" TEXT,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBundle" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "regularPrice" INTEGER NOT NULL,
    "bundlePrice" INTEGER NOT NULL,
    "savingsAmount" INTEGER NOT NULL,
    "savingsPercent" DOUBLE PRECISION NOT NULL,
    "billingType" "BillingType" NOT NULL DEFAULT 'ONE_TIME',
    "billingInterval" "BillingInterval",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "maxPurchases" INTEGER,
    "currentPurchases" INTEGER NOT NULL DEFAULT 0,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),

    CONSTRAINT "ProductBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBundleItem" (
    "id" SERIAL NOT NULL,
    "bundleId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProductBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "ruleType" "PricingRuleType" NOT NULL DEFAULT 'VOLUME_DISCOUNT',
    "conditions" JSONB NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DOUBLE PRECISION NOT NULL,
    "applyTo" "DiscountApplyTo" NOT NULL DEFAULT 'ALL_PRODUCTS',
    "productIds" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPayment" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "planId" TEXT,
    "planName" TEXT,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "type" "ScheduledPaymentType" NOT NULL DEFAULT 'AUTO_CHARGE',
    "status" "ScheduledPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3),
    "paymentId" INTEGER,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" INTEGER,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" INTEGER,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "customDomain" TEXT,
    "status" "ClinicStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "integrations" JSONB NOT NULL,
    "patientIdPrefix" TEXT,
    "stripeAccountId" TEXT,
    "stripeAccountStatus" TEXT,
    "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "stripePlatformAccount" BOOLEAN NOT NULL DEFAULT false,
    "stripeConnectedAt" TIMESTAMP(3),
    "lifefileBaseUrl" TEXT,
    "lifefileUsername" TEXT,
    "lifefilePassword" TEXT,
    "lifefileVendorId" TEXT,
    "lifefilePracticeId" TEXT,
    "lifefileLocationId" TEXT,
    "lifefileNetworkId" TEXT,
    "lifefilePracticeName" TEXT,
    "lifefilePracticeAddress" TEXT,
    "lifefilePracticePhone" TEXT,
    "lifefilePracticeFax" TEXT,
    "lifefileWebhookSecret" TEXT,
    "lifefileDatapushUsername" TEXT,
    "lifefileDatapushPassword" TEXT,
    "lifefileEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lifefileInboundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lifefileInboundPath" TEXT,
    "lifefileInboundUsername" TEXT,
    "lifefileInboundPassword" TEXT,
    "lifefileInboundSecret" TEXT,
    "lifefileInboundAllowedIPs" TEXT,
    "lifefileInboundEvents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "doseSpotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "doseSpotBaseUrl" TEXT,
    "doseSpotTokenUrl" TEXT,
    "doseSpotSsoUrl" TEXT,
    "doseSpotClinicId" TEXT,
    "doseSpotClinicKey" TEXT,
    "doseSpotAdminId" TEXT,
    "doseSpotSubscriptionKey" TEXT,
    "zoomAccountId" TEXT,
    "zoomAccountEmail" TEXT,
    "zoomClientId" TEXT,
    "zoomClientSecret" TEXT,
    "zoomAccessToken" TEXT,
    "zoomRefreshToken" TEXT,
    "zoomTokenExpiresAt" TIMESTAMP(3),
    "zoomWebhookSecret" TEXT,
    "zoomSdkKey" TEXT,
    "zoomSdkSecret" TEXT,
    "zoomEnabled" BOOLEAN NOT NULL DEFAULT false,
    "zoomOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "zoomConnectedAt" TIMESTAMP(3),
    "zoomWaitingRoomEnabled" BOOLEAN NOT NULL DEFAULT true,
    "zoomRecordingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "zoomHipaaCompliant" BOOLEAN NOT NULL DEFAULT true,
    "fedexClientId" TEXT,
    "fedexClientSecret" TEXT,
    "fedexAccountNumber" TEXT,
    "fedexEnabled" BOOLEAN NOT NULL DEFAULT false,
    "billingPlan" TEXT NOT NULL DEFAULT 'starter',
    "patientLimit" INTEGER NOT NULL DEFAULT 100,
    "providerLimit" INTEGER NOT NULL DEFAULT 5,
    "storageLimit" INTEGER NOT NULL DEFAULT 5000,
    "adminEmail" TEXT NOT NULL,
    "supportEmail" TEXT,
    "phone" TEXT,
    "address" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "logoUrl" TEXT,
    "iconUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3B82F6',
    "secondaryColor" TEXT NOT NULL DEFAULT '#10B981',
    "accentColor" TEXT NOT NULL DEFAULT '#d3f931',
    "backgroundColor" TEXT NOT NULL DEFAULT '#F9FAFB',
    "buttonTextColor" TEXT NOT NULL DEFAULT 'auto',
    "customCss" TEXT,
    "databaseUrl" TEXT,
    "schemaName" TEXT,
    "defaultBudDays" INTEGER NOT NULL DEFAULT 90,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicAuditLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "userId" INTEGER,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ClinicAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReport" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "documentId" INTEGER,
    "labName" TEXT NOT NULL DEFAULT 'Quest Diagnostics',
    "parserVersion" TEXT,
    "specimenId" TEXT,
    "collectedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "fasting" BOOLEAN,

    CONSTRAINT "LabReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReportResult" (
    "id" SERIAL NOT NULL,
    "labReportId" INTEGER NOT NULL,
    "testName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueNumeric" DOUBLE PRECISION,
    "unit" TEXT,
    "referenceRange" TEXT,
    "flag" TEXT,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LabReportResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SOAPNote" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "subjective" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "sourceType" "SOAPSourceType" NOT NULL DEFAULT 'MANUAL',
    "intakeDocumentId" INTEGER,
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "aiModelVersion" TEXT,
    "status" "SOAPNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "editPasswordHash" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "medicalNecessity" TEXT,

    CONSTRAINT "SOAPNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SOAPNoteRevision" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soapNoteId" INTEGER NOT NULL,
    "editorEmail" TEXT,
    "editorRole" TEXT,
    "previousContent" JSONB NOT NULL,
    "newContent" JSONB NOT NULL,
    "changeReason" TEXT,

    CONSTRAINT "SOAPNoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER,
    "userEmail" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3),
    "summary" TEXT,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "queryType" TEXT,
    "citations" JSONB,
    "confidence" DOUBLE PRECISION,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "responseTimeMs" INTEGER,
    "toolCallsCount" INTEGER,
    "firstTokenMs" INTEGER,
    "model" TEXT,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "templateId" INTEGER,
    "pdfUrl" TEXT,
    "patientSignature" TEXT,
    "patientSignedAt" TIMESTAMP(3),
    "providerSignature" TEXT,
    "providerSignedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanTemplate" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "treatmentType" TEXT,
    "defaultDurationDays" INTEGER DEFAULT 90,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanGoal" (
    "id" SERIAL NOT NULL,
    "carePlanId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" TEXT,
    "currentValue" TEXT,
    "unit" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanActivity" (
    "id" SERIAL NOT NULL,
    "carePlanId" INTEGER NOT NULL,
    "goalId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT,
    "instructions" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePlanActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanProgress" (
    "id" SERIAL NOT NULL,
    "carePlanId" INTEGER NOT NULL,
    "goalId" INTEGER,
    "activityId" INTEGER,
    "value" TEXT,
    "notes" TEXT,
    "recordedById" INTEGER,
    "recordedByPatient" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePlanProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" SERIAL NOT NULL,
    "policyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "approvalRoles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyApproval" (
    "id" SERIAL NOT NULL,
    "policyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "approvalType" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "contentHashAtApproval" TEXT NOT NULL,
    "signatureStatement" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAcknowledgment" (
    "id" SERIAL NOT NULL,
    "policyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "clinicId" INTEGER,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "contentHashAtAcknowledgment" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressValidationLog" (
    "id" SERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "inputFormat" TEXT NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER,
    "wasStandardized" BOOLEAN NOT NULL DEFAULT false,
    "confidence" INTEGER,
    "processingTimeMs" INTEGER,
    "errorMessage" TEXT,
    "inputPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressValidationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientShippingUpdate" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER,
    "orderId" INTEGER,
    "matchedAt" TIMESTAMP(3),
    "trackingNumber" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "trackingUrl" TEXT,
    "status" "ShippingStatus" NOT NULL DEFAULT 'SHIPPED',
    "statusNote" TEXT,
    "shippedAt" TIMESTAMP(3),
    "estimatedDelivery" TIMESTAMP(3),
    "actualDelivery" TIMESTAMP(3),
    "medicationName" TEXT,
    "medicationStrength" TEXT,
    "medicationQuantity" TEXT,
    "medicationForm" TEXT,
    "lifefileOrderId" TEXT,
    "externalRef" TEXT,
    "brand" TEXT,
    "patientConfirmedAt" TIMESTAMP(3),
    "patientConfirmedById" INTEGER,
    "rawPayload" JSONB,
    "source" TEXT NOT NULL DEFAULT 'lifefile',
    "matchStrategy" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PatientShippingUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLabel" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "trackingNumber" TEXT NOT NULL,
    "shipmentId" TEXT,
    "serviceType" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'FEDEX',
    "originAddress" JSONB NOT NULL,
    "destinationAddress" JSONB NOT NULL,
    "weightLbs" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "weightOz" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "labelS3Key" TEXT,
    "labelPdfBase64" TEXT,
    "labelFormat" TEXT NOT NULL DEFAULT 'PDF',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "voidedAt" TIMESTAMP(3),
    "voidedBy" INTEGER,

    CONSTRAINT "ShipmentLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagePhoto" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "lifefileId" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "trackingSource" TEXT,
    "patientId" INTEGER,
    "orderId" INTEGER,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "fileSize" INTEGER,
    "capturedById" INTEGER NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "matchedAt" TIMESTAMP(3),
    "matchStrategy" TEXT,
    "notes" TEXT,
    "assignedClinicId" INTEGER,

    CONSTRAINT "PackagePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefillQueue" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "subscriptionId" INTEGER,
    "lastOrderId" INTEGER,
    "vialCount" INTEGER NOT NULL DEFAULT 1,
    "refillIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "nextRefillDate" TIMESTAMP(3) NOT NULL,
    "lastRefillDate" TIMESTAMP(3),
    "shipmentNumber" INTEGER,
    "totalShipments" INTEGER,
    "parentRefillId" INTEGER,
    "budDays" INTEGER NOT NULL DEFAULT 90,
    "reminderSentAt" TIMESTAMP(3),
    "patientNotifiedAt" TIMESTAMP(3),
    "status" "RefillStatus" NOT NULL DEFAULT 'SCHEDULED',
    "paymentVerified" BOOLEAN NOT NULL DEFAULT false,
    "paymentVerifiedAt" TIMESTAMP(3),
    "paymentVerifiedBy" INTEGER,
    "paymentMethod" "PaymentVerificationMethod",
    "paymentReference" TEXT,
    "stripePaymentId" TEXT,
    "invoiceId" INTEGER,
    "adminApproved" BOOLEAN,
    "adminApprovedAt" TIMESTAMP(3),
    "adminApprovedBy" INTEGER,
    "adminNotes" TEXT,
    "providerQueuedAt" TIMESTAMP(3),
    "prescribedAt" TIMESTAMP(3),
    "prescribedBy" INTEGER,
    "orderId" INTEGER,
    "requestedEarly" BOOLEAN NOT NULL DEFAULT false,
    "patientNotes" TEXT,
    "medicationName" TEXT,
    "medicationStrength" TEXT,
    "medicationForm" TEXT,
    "planName" TEXT,

    CONSTRAINT "RefillQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFormTemplate" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "treatmentType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "providerId" INTEGER,
    "createdById" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "IntakeFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFormQuestion" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "templateId" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,
    "placeholder" TEXT,
    "helpText" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT,
    "conditionalLogic" JSONB,

    CONSTRAINT "IntakeFormQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFormSubmission" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "formLinkId" TEXT,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "signature" TEXT,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "IntakeFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFormResponse" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "answer" TEXT,
    "fileUrl" TEXT,

    CONSTRAINT "IntakeFormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFormLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "templateId" INTEGER NOT NULL,
    "patientEmail" TEXT NOT NULL,
    "patientPhone" TEXT,
    "sentVia" TEXT,
    "sentAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdById" INTEGER,
    "salesRepId" INTEGER,
    "clinicId" INTEGER,

    CONSTRAINT "IntakeFormLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFormDraft" (
    "id" TEXT NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "templateId" INTEGER NOT NULL,
    "patientId" INTEGER,
    "sessionId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "completedSteps" JSONB NOT NULL,
    "responses" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSavedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'IN_PROGRESS',

    CONSTRAINT "IntakeFormDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "source" TEXT,
    "eventId" TEXT,
    "eventType" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "headers" JSONB,
    "payload" JSONB,
    "status" "WebhookStatus" NOT NULL,
    "statusCode" INTEGER,
    "errorMessage" TEXT,
    "responseData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "processingTimeMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'INACTIVE',
    "config" JSONB NOT NULL,
    "credentials" JSONB,
    "webhookUrl" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "rateLimit" INTEGER NOT NULL DEFAULT 1000,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "integrationId" INTEGER,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" SERIAL NOT NULL,
    "apiKeyId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "requestBody" JSONB,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookConfig" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "headers" JSONB,
    "secret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "retryPolicy" JSONB,
    "integrationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" SERIAL NOT NULL,
    "webhookId" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL,
    "source" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "statusCode" INTEGER,
    "response" JSONB,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" SERIAL NOT NULL,
    "integrationId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperTool" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "lastCheckAt" TIMESTAMP(3),
    "healthStatus" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalMessage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "senderId" INTEGER NOT NULL,
    "recipientId" INTEGER,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "attachments" JSONB,
    "messageType" "InternalMessageType" NOT NULL DEFAULT 'DIRECT',
    "channelId" TEXT,
    "parentMessageId" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "InternalMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "patientId" INTEGER,
    "messageSid" TEXT,
    "fromPhone" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "metadata" JSONB,
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "price" DECIMAL(10,4),
    "priceUnit" TEXT,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "templateType" TEXT,
    "isOptOutResponse" BOOLEAN NOT NULL DEFAULT false,
    "queuedForRetry" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "statusUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsOptOut" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER,
    "reason" TEXT NOT NULL DEFAULT 'STOP',
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "optedInAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'sms',
    "lastMessageSid" TEXT,

    CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsQuietHours" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Quiet Hours',
    "startHour" INTEGER NOT NULL DEFAULT 21,
    "startMinute" INTEGER NOT NULL DEFAULT 0,
    "endHour" INTEGER NOT NULL DEFAULT 8,
    "endMinute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],

    CONSTRAINT "SmsQuietHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsRateLimit" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "clinicId" INTEGER,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailyCount" INTEGER NOT NULL DEFAULT 0,
    "dailyWindowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedUntil" TIMESTAMP(3),
    "blockReason" TEXT,

    CONSTRAINT "SmsRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientChatMessage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'WEB',
    "senderType" "SenderType" NOT NULL,
    "senderId" INTEGER,
    "senderName" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "externalId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "threadId" TEXT,
    "replyToId" INTEGER,
    "attachments" JSONB,
    "metadata" JSONB,

    CONSTRAINT "PatientChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "deviceType" TEXT,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "category" "NotificationCategory" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "metadata" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientUserId" INTEGER,
    "clinicId" INTEGER,
    "subject" TEXT NOT NULL,
    "template" TEXT,
    "templateData" JSONB,
    "status" "EmailLogStatus" NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "bounceType" TEXT,
    "bounceSubType" TEXT,
    "complaintType" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledEmail" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientUserId" INTEGER,
    "clinicId" INTEGER,
    "subject" TEXT,
    "template" TEXT NOT NULL,
    "templateData" JSONB NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledEmailStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "emailLogId" INTEGER,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "automationTrigger" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "soundVolume" INTEGER NOT NULL DEFAULT 50,
    "soundForPriorities" JSONB NOT NULL DEFAULT '["HIGH", "URGENT"]',
    "toastEnabled" BOOLEAN NOT NULL DEFAULT true,
    "toastDuration" INTEGER NOT NULL DEFAULT 5000,
    "toastPosition" TEXT NOT NULL DEFAULT 'top-right',
    "browserNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dndEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dndScheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dndStartTime" TEXT NOT NULL DEFAULT '22:00',
    "dndEndTime" TEXT NOT NULL DEFAULT '08:00',
    "dndDays" JSONB NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
    "mutedCategories" JSONB NOT NULL DEFAULT '[]',
    "groupSimilar" BOOLEAN NOT NULL DEFAULT true,
    "showDesktopBadge" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "lifefileId" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "address2" TEXT,
    "patientId" TEXT,
    "stripeCustomerId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceMetadata" JSONB,
    "profileStatus" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "attributionAffiliateId" INTEGER,
    "attributionRefCode" TEXT,
    "attributionFirstTouchAt" TIMESTAMP(3),
    "smsConsent" BOOLEAN NOT NULL DEFAULT true,
    "smsConsentAt" TIMESTAMP(3),
    "smsConsentSource" TEXT,
    "doseSpotPatientId" INTEGER,
    "searchIndex" TEXT,
    "portalNotificationPrefs" JSONB,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "identityVerifiedAt" TIMESTAMP(3),
    "identityVerifiedBy" INTEGER,
    "emailHash" TEXT,
    "dobHash" TEXT,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "source" TEXT,
    "data" BYTEA,
    "externalUrl" TEXT,
    "s3DataKey" TEXT,
    "sourceSubmissionId" TEXT,
    "category" "PatientDocumentCategory" NOT NULL DEFAULT 'OTHER',
    "contentHash" TEXT,

    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientCounter" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PatientCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientSalesRepAssignment" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "salesRepId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" INTEGER,
    "removedAt" TIMESTAMP(3),
    "removedById" INTEGER,
    "removalNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PatientSalesRepAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPhoto" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "type" "PatientPhotoType" NOT NULL,
    "category" TEXT,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "thumbnailUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "title" TEXT,
    "notes" TEXT,
    "weight" DOUBLE PRECISION,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "PatientPhotoVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" INTEGER,
    "verificationNotes" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" INTEGER,
    "deletionReason" TEXT,
    "uploadedFrom" TEXT,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "PatientPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientNote" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "noteType" TEXT,

    CONSTRAINT "PatientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyInvoiceUpload" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "uploadedBy" INTEGER NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "amountDueCents" INTEGER,
    "payorId" TEXT,
    "billingProfileId" TEXT,
    "pharmacyName" TEXT,
    "s3Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "PharmacyInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "parsedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "totalLineItems" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "discrepancyCount" INTEGER NOT NULL DEFAULT 0,
    "invoiceTotalCents" INTEGER NOT NULL DEFAULT 0,
    "matchedTotalCents" INTEGER NOT NULL DEFAULT 0,
    "unmatchedTotalCents" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PharmacyPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "paidAmountCents" INTEGER NOT NULL DEFAULT 0,
    "paymentReference" TEXT,
    "paymentNotes" TEXT,
    "paidBy" INTEGER,

    CONSTRAINT "PharmacyInvoiceUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyInvoiceLineItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceUploadId" INTEGER NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "lineType" "PharmacyInvoiceLineType" NOT NULL DEFAULT 'MEDICATION',
    "date" TIMESTAMP(3),
    "lifefileOrderId" TEXT,
    "rxNumber" TEXT,
    "fillId" TEXT,
    "patientName" TEXT,
    "doctorName" TEXT,
    "description" TEXT,
    "medicationName" TEXT,
    "strength" TEXT,
    "form" TEXT,
    "vialSize" TEXT,
    "shippingMethod" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "orderSubtotalCents" INTEGER,
    "matchStatus" "PharmacyInvoiceMatchStatus" NOT NULL DEFAULT 'PENDING',
    "matchedOrderId" INTEGER,
    "matchedPatientId" INTEGER,
    "matchedProviderId" INTEGER,
    "matchConfidence" DOUBLE PRECISION,
    "matchNotes" TEXT,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfLineItemId" INTEGER,
    "adminNotes" TEXT,
    "disputed" BOOLEAN NOT NULL DEFAULT false,
    "adjustedAmountCents" INTEGER,
    "manuallyMatchedBy" INTEGER,
    "manuallyMatchedAt" TIMESTAMP(3),

    CONSTRAINT "PharmacyInvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyConsolidatedStatement" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "invoiceIds" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PharmacyConsolidatedStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicPlatformFeeConfig" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "prescriptionFeeType" "PlatformFeeCalculationType" NOT NULL DEFAULT 'FLAT',
    "prescriptionFeeAmount" INTEGER NOT NULL DEFAULT 2000,
    "transmissionFeeType" "PlatformFeeCalculationType" NOT NULL DEFAULT 'FLAT',
    "transmissionFeeAmount" INTEGER NOT NULL DEFAULT 500,
    "adminFeeType" "PlatformAdminFeeType" NOT NULL DEFAULT 'NONE',
    "adminFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "prescriptionCycleDays" INTEGER NOT NULL DEFAULT 90,
    "billingEmail" TEXT,
    "billingName" TEXT,
    "billingAddress" JSONB,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "notes" TEXT,
    "customFeeRules" JSONB,

    CONSTRAINT "ClinicPlatformFeeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeeEvent" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "configId" INTEGER NOT NULL,
    "feeType" "PlatformFeeType" NOT NULL,
    "orderId" INTEGER,
    "providerId" INTEGER,
    "patientId" INTEGER,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "periodSales" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "calculationDetails" JSONB,
    "invoiceId" INTEGER,
    "status" "PlatformFeeStatus" NOT NULL DEFAULT 'PENDING',
    "voidedAt" TIMESTAMP(3),
    "voidedBy" INTEGER,
    "voidedReason" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waivedBy" INTEGER,
    "waivedReason" TEXT,

    CONSTRAINT "PlatformFeeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicPlatformInvoice" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "configId" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodType" "ClinicInvoicePeriodType" NOT NULL,
    "prescriptionFeeTotal" INTEGER NOT NULL DEFAULT 0,
    "transmissionFeeTotal" INTEGER NOT NULL DEFAULT 0,
    "adminFeeTotal" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "prescriptionCount" INTEGER NOT NULL DEFAULT 0,
    "transmissionCount" INTEGER NOT NULL DEFAULT 0,
    "invoiceNumber" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "stripeInvoiceId" TEXT,
    "stripeInvoiceUrl" TEXT,
    "stripePdfUrl" TEXT,
    "pdfUrl" TEXT,
    "pdfS3Key" TEXT,
    "pdfS3ETag" TEXT,
    "status" "ClinicInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "paidAmountCents" INTEGER,
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "paymentHistory" JSONB,
    "generatedBy" INTEGER,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" INTEGER,
    "sentAt" TIMESTAMP(3),
    "sentBy" INTEGER,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "notes" TEXT,
    "externalNotes" TEXT,

    CONSTRAINT "ClinicPlatformInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicCreditNote" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "lineItems" JSONB,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "appliedAt" TIMESTAMP(3),
    "createdBy" INTEGER,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" INTEGER,

    CONSTRAINT "ClinicCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "lifefileOrderId" TEXT,
    "fulfillmentChannel" TEXT NOT NULL DEFAULT 'lifefile',
    "status" TEXT,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "shippingMethod" INTEGER NOT NULL,
    "primaryMedName" TEXT,
    "primaryMedStrength" TEXT,
    "primaryMedForm" TEXT,
    "errorMessage" TEXT,
    "requestJson" TEXT,
    "responseJson" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "lastWebhookPayload" TEXT,
    "shippingStatus" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "doseSpotPrescriptionId" INTEGER,
    "doseSpotPatientId" INTEGER,
    "externalPharmacyName" TEXT,
    "externalPharmacyId" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" INTEGER,
    "cancellationReason" TEXT,
    "cancellationNotes" TEXT,
    "lifefileCancelResponse" TEXT,
    "lastModifiedAt" TIMESTAMP(3),
    "lastModifiedBy" INTEGER,
    "modificationHistory" JSONB,
    "assignedProviderId" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "assignmentSource" TEXT,
    "queuedForProviderAt" TIMESTAMP(3),
    "queuedByUserId" INTEGER,
    "approvedByUserId" INTEGER,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rx" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "medicationKey" TEXT NOT NULL,
    "medName" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "refills" TEXT NOT NULL,
    "sig" TEXT NOT NULL,
    "daysSupply" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "Rx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" INTEGER NOT NULL,
    "lifefileOrderId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "note" TEXT,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RxOrderSet" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "RxOrderSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RxOrderSetItem" (
    "id" SERIAL NOT NULL,
    "orderSetId" INTEGER NOT NULL,
    "medicationKey" TEXT NOT NULL,
    "sig" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "refills" TEXT NOT NULL,
    "daysSupply" INTEGER NOT NULL DEFAULT 30,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RxOrderSetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPrescriptionCycle" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "medicationKey" TEXT NOT NULL,
    "lastChargedAt" TIMESTAMP(3) NOT NULL,
    "lastOrderId" INTEGER NOT NULL,
    "nextEligibleAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPrescriptionCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "archivedBy" INTEGER,
    "clinicId" INTEGER,
    "primaryClinicId" INTEGER,
    "activeClinicId" INTEGER,
    "isEonproProvider" BOOLEAN NOT NULL DEFAULT false,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "titleLine" TEXT,
    "npi" TEXT NOT NULL,
    "licenseState" TEXT,
    "licenseNumber" TEXT,
    "dea" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "signatureDataUrl" TEXT,
    "npiVerifiedAt" TIMESTAMP(3),
    "npiRawResponse" JSONB,
    "lastLogin" TIMESTAMP(3),
    "passwordHash" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "doseSpotClinicianId" INTEGER,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderLicense" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderLicense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderClinic" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "titleLine" TEXT,
    "deaNumber" TEXT,
    "licenseNumber" TEXT,
    "licenseState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderClinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAvailability" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "locationId" INTEGER,
    "appointmentTypes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTimeOff" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "reason" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDateOverride" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderDateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCalendarIntegration" (
    "id" SERIAL NOT NULL,
    "providerId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "clinicId" INTEGER,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "accountId" TEXT,
    "calendarId" TEXT DEFAULT 'primary',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "syncDirection" TEXT NOT NULL DEFAULT 'both',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCalendarIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRoutingConfig" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "routingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "compensationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "routingStrategy" "RoutingStrategy" NOT NULL DEFAULT 'PROVIDER_CHOICE',
    "soapApprovalMode" "SoapApprovalMode" NOT NULL DEFAULT 'ADVISORY',
    "lastAssignedIndex" INTEGER NOT NULL DEFAULT 0,
    "lastAssignedProviderId" INTEGER,
    "autoAssignOnPayment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderRoutingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCompensationPlan" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "compensationType" "CompensationType" NOT NULL DEFAULT 'FLAT_RATE',
    "flatRatePerScript" INTEGER NOT NULL DEFAULT 500,
    "percentBps" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "notes" TEXT,

    CONSTRAINT "ProviderCompensationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCompensationEvent" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "prescriptionCount" INTEGER NOT NULL DEFAULT 1,
    "orderTotalCents" INTEGER,
    "calculationDetails" JSONB,
    "status" "CompensationEventStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" INTEGER,
    "paidAt" TIMESTAMP(3),
    "payoutReference" TEXT,
    "payoutBatchId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" INTEGER,
    "voidedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ProviderCompensationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataSource" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isSystemTemplate" BOOLEAN NOT NULL DEFAULT false,
    "accessRoles" TEXT[] DEFAULT ARRAY['super_admin', 'admin']::TEXT[],
    "lastRunAt" TIMESTAMP(3),

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "frequency" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "timeUtc" TEXT NOT NULL DEFAULT '06:00',
    "exportFormat" TEXT NOT NULL DEFAULT 'csv',
    "recipients" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueRecognitionEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "stripeChargeId" TEXT,
    "stripeSubscriptionId" TEXT,
    "invoiceItemId" INTEGER,
    "description" TEXT,
    "totalAmountCents" INTEGER NOT NULL,
    "recognizedCents" INTEGER NOT NULL DEFAULT 0,
    "deferredCents" INTEGER NOT NULL,
    "recognitionStart" TIMESTAMP(3) NOT NULL,
    "recognitionEnd" TIMESTAMP(3) NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT 'over_period',
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "RevenueRecognitionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueRecognitionJournal" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryId" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "journalType" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "RevenueRecognitionJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepRefCode" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "salesRepId" INTEGER NOT NULL,
    "refCode" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SalesRepRefCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepTouch" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "visitorFingerprint" TEXT NOT NULL,
    "cookieId" TEXT,
    "ipAddressHash" TEXT,
    "userAgent" TEXT,
    "salesRepId" INTEGER NOT NULL,
    "refCode" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "landingPage" TEXT,
    "referrerUrl" TEXT,
    "touchType" "TouchType" NOT NULL DEFAULT 'CLICK',
    "convertedPatientId" INTEGER,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "SalesRepTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepCommissionPlan" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "planType" "CommissionPlanType" NOT NULL DEFAULT 'PERCENT',
    "flatAmountCents" INTEGER,
    "percentBps" INTEGER,
    "appliesTo" "CommissionAppliesTo" NOT NULL DEFAULT 'FIRST_PAYMENT_ONLY',
    "holdDays" INTEGER NOT NULL DEFAULT 0,
    "clawbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "initialPercentBps" INTEGER,
    "initialFlatAmountCents" INTEGER,
    "recurringPercentBps" INTEGER,
    "recurringFlatAmountCents" INTEGER,
    "recurringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recurringMonths" INTEGER,
    "multiItemBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "multiItemBonusType" TEXT,
    "multiItemBonusPercentBps" INTEGER,
    "multiItemBonusFlatCents" INTEGER,
    "multiItemMinQuantity" INTEGER,
    "reactivationDays" INTEGER,
    "volumeTierEnabled" BOOLEAN NOT NULL DEFAULT false,
    "volumeTierWindow" TEXT,
    "volumeTierRetroactive" BOOLEAN NOT NULL DEFAULT true,
    "volumeTierBasis" TEXT NOT NULL DEFAULT 'SALE_COUNT',

    CONSTRAINT "SalesRepCommissionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepPlanAssignment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "salesRepId" INTEGER NOT NULL,
    "commissionPlanId" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "hourlyRateCents" INTEGER,
    "weeklyBasePayCents" INTEGER,

    CONSTRAINT "SalesRepPlanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepProductCommission" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER NOT NULL,
    "productId" INTEGER,
    "productBundleId" INTEGER,
    "bonusType" TEXT NOT NULL,
    "percentBps" INTEGER,
    "flatAmountCents" INTEGER,

    CONSTRAINT "SalesRepProductCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepCommissionEvent" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "salesRepId" INTEGER NOT NULL,
    "stripeEventId" TEXT,
    "stripeObjectId" TEXT,
    "stripeEventType" TEXT,
    "eventAmountCents" INTEGER NOT NULL,
    "commissionAmountCents" INTEGER NOT NULL,
    "baseCommissionCents" INTEGER NOT NULL DEFAULT 0,
    "volumeTierBonusCents" INTEGER NOT NULL DEFAULT 0,
    "productBonusCents" INTEGER NOT NULL DEFAULT 0,
    "multiItemBonusCents" INTEGER NOT NULL DEFAULT 0,
    "commissionPlanId" INTEGER,
    "patientId" INTEGER,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringMonth" INTEGER,
    "status" "CommissionEventStatus" NOT NULL DEFAULT 'PENDING',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "holdUntil" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SalesRepCommissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepVolumeCommissionTier" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planId" INTEGER NOT NULL,
    "minSales" INTEGER NOT NULL,
    "maxSales" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "minRevenueCents" INTEGER,
    "additionalPercentBps" INTEGER,

    CONSTRAINT "SalesRepVolumeCommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSalary" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "weeklyBasePayCents" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "EmployeeSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepOverrideAssignment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "overrideRepId" INTEGER NOT NULL,
    "subordinateRepId" INTEGER NOT NULL,
    "overridePercentBps" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedById" INTEGER,
    "notes" TEXT,

    CONSTRAINT "SalesRepOverrideAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepOverrideCommissionEvent" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "overrideRepId" INTEGER NOT NULL,
    "subordinateRepId" INTEGER NOT NULL,
    "sourceCommissionEventId" INTEGER,
    "overrideAssignmentId" INTEGER NOT NULL,
    "eventAmountCents" INTEGER NOT NULL,
    "overridePercentBps" INTEGER NOT NULL,
    "commissionAmountCents" INTEGER NOT NULL,
    "patientId" INTEGER,
    "stripeEventId" TEXT,
    "status" "CommissionEventStatus" NOT NULL DEFAULT 'PENDING',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "holdUntil" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SalesRepOverrideCommissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepDisposition" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "salesRepId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "leadSource" "DispositionLeadSource" NOT NULL,
    "contactMethod" "DispositionContactMethod" NOT NULL,
    "outcome" "DispositionOutcome" NOT NULL,
    "productInterest" TEXT,
    "notes" TEXT,
    "followUpDate" TIMESTAMP(3),
    "followUpNotes" TEXT,
    "tags" JSONB,
    "status" "DispositionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" INTEGER,
    "reviewNote" TEXT,
    "autoAssigned" BOOLEAN NOT NULL DEFAULT false,
    "assignmentId" INTEGER,

    CONSTRAINT "SalesRepDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "planDescription" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextBillingDate" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "resumeAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "paymentMethodId" INTEGER,
    "stripeSubscriptionId" TEXT,
    "metadata" JSONB,
    "lastPaymentId" INTEGER,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "vialCount" INTEGER NOT NULL DEFAULT 1,
    "refillIntervalDays" INTEGER,
    "lastRefillQueueId" INTEGER,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionAction" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionId" INTEGER NOT NULL,
    "actionType" "SubscriptionActionType" NOT NULL,
    "reason" TEXT,
    "pausedUntil" TIMESTAMP(3),
    "previousPlanId" TEXT,
    "newPlanId" TEXT,
    "previousAmount" INTEGER,
    "newAmount" INTEGER,
    "cancellationReason" TEXT,
    "retentionOfferMade" BOOLEAN NOT NULL DEFAULT false,
    "retentionOfferId" INTEGER,
    "performedBy" TEXT,

    CONSTRAINT "SubscriptionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionOffer" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "offerType" "RetentionOfferType" NOT NULL DEFAULT 'DISCOUNT',
    "discountType" "DiscountType",
    "discountValue" DOUBLE PRECISION,
    "discountDuration" INTEGER,
    "freeMonths" INTEGER,
    "pauseDuration" INTEGER,
    "triggerOn" TEXT NOT NULL DEFAULT 'cancellation',
    "minSubscriptionAge" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timesShown" INTEGER NOT NULL DEFAULT 0,
    "timesAccepted" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RetentionOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ticketNumber" TEXT NOT NULL DEFAULT '',
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'P3_MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "disposition" "TicketDisposition",
    "category" "TicketCategory" NOT NULL DEFAULT 'GENERAL',
    "source" "TicketSource" NOT NULL DEFAULT 'INTERNAL',
    "patientId" INTEGER,
    "orderId" INTEGER,
    "isNonClientIssue" BOOLEAN NOT NULL DEFAULT false,
    "reporterEmail" TEXT,
    "reporterName" TEXT,
    "reporterPhone" TEXT,
    "createdById" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "teamId" INTEGER,
    "currentOwnerId" INTEGER,
    "lastWorkedById" INTEGER,
    "lastWorkedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "resolutionNotes" TEXT,
    "rootCause" VARCHAR(500),
    "resolutionTime" INTEGER,
    "actualWorkTime" INTEGER,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "lastReopenedAt" TIMESTAMP(3),
    "lastReopenedById" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB,
    "internalNote" TEXT,
    "parentTicketId" INTEGER,
    "currentViewers" JSONB,
    "lockedById" INTEGER,
    "lockedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" INTEGER,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAssignment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "assignedById" INTEGER NOT NULL,
    "assignedToId" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "TicketAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatusHistory" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "fromStatus" "TicketStatus" NOT NULL,
    "toStatus" "TicketStatus" NOT NULL,
    "changedById" INTEGER NOT NULL,
    "reason" TEXT,

    CONSTRAINT "TicketStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketWorkLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" "TicketAction" NOT NULL,
    "duration" INTEGER,
    "description" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,

    CONSTRAINT "TicketWorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEscalation" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "escalatedById" INTEGER NOT NULL,
    "escalatedToId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "TicketEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSLA" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "firstResponseDue" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolutionDue" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "breached" BOOLEAN NOT NULL DEFAULT false,
    "breachReason" TEXT,
    "slaPolicyId" INTEGER,
    "pausedAt" TIMESTAMP(3),
    "totalPausedTime" INTEGER NOT NULL DEFAULT 0,
    "warningNotified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TicketSLA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTeam" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "defaultPriority" "TicketPriority",
    "defaultSlaPolicyId" INTEGER,
    "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT false,
    "roundRobinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxTicketsPerMember" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTeamMember" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "currentTicketCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketWatcher" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "notifyOnComment" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnStatus" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnAssign" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnResolve" BOOLEAN NOT NULL DEFAULT true,
    "addedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketRelation" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "relationType" TEXT NOT NULL,
    "relatedId" INTEGER NOT NULL,
    "relatedDisplay" TEXT,
    "relationNote" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAttachment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "commentId" INTEGER,
    "uploadedById" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketActivity" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER,
    "activityType" "TicketActivityType" NOT NULL,
    "fieldChanged" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "details" JSONB,
    "automationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "TicketActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMerge" (
    "id" SERIAL NOT NULL,
    "sourceTicketId" INTEGER NOT NULL,
    "targetTicketId" INTEGER NOT NULL,
    "mergedById" INTEGER NOT NULL,
    "reason" TEXT,
    "commentsTransferred" INTEGER NOT NULL DEFAULT 0,
    "attachmentsTransferred" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMerge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaPolicyConfig" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TicketPriority",
    "category" "TicketCategory",
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "nextResponseMinutes" INTEGER,
    "businessHoursId" INTEGER,
    "respectBusinessHours" BOOLEAN NOT NULL DEFAULT true,
    "escalateOnBreach" BOOLEAN NOT NULL DEFAULT true,
    "warningThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "escalateToTeamId" INTEGER,
    "escalateToUserId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketBusinessHours" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "schedule" JSONB NOT NULL,
    "holidays" JSONB NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketBusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMacro" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "TicketCategory",
    "teamId" INTEGER,
    "responseTitle" TEXT,
    "responseContent" TEXT NOT NULL,
    "isHtmlContent" BOOLEAN NOT NULL DEFAULT false,
    "setStatus" "TicketStatus",
    "setPriority" "TicketPriority",
    "setCategory" "TicketCategory",
    "addTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "removeTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketMacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTemplate" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "TicketCategory" NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "descriptionTemplate" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "source" "TicketSource" NOT NULL DEFAULT 'INTERNAL',
    "defaultTeamId" INTEGER,
    "defaultAssigneeId" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFieldsSchema" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAutomationRule" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "AutomationTrigger" NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "stopOnMatch" BOOLEAN NOT NULL DEFAULT false,
    "scheduleExpression" TEXT,
    "lastScheduledRun" TIMESTAMP(3),
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "lastExecutedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketAutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSavedView" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "filters" JSONB NOT NULL,
    "sortField" TEXT NOT NULL DEFAULT 'createdAt',
    "sortOrder" TEXT NOT NULL DEFAULT 'desc',
    "columns" TEXT[] DEFAULT ARRAY['ticketNumber', 'title', 'status', 'priority', 'assignedTo', 'createdAt']::TEXT[],
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCsat" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "surveyToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketCsat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientWeightLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'lbs',
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'patient',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientWeightLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMedicationReminder" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "timeOfDay" TEXT NOT NULL DEFAULT '08:00',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggered" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "PatientMedicationReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientWaterLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'oz',
    "source" TEXT NOT NULL DEFAULT 'patient',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "PatientWaterLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientExerciseLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "activityType" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "intensity" TEXT NOT NULL DEFAULT 'moderate',
    "calories" INTEGER,
    "steps" INTEGER,
    "distance" DOUBLE PRECISION,
    "heartRateAvg" INTEGER,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'patient',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientExerciseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientSleepLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "sleepStart" TIMESTAMP(3) NOT NULL,
    "sleepEnd" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "quality" INTEGER,
    "deepSleep" INTEGER,
    "remSleep" INTEGER,
    "lightSleep" INTEGER,
    "awakeTime" INTEGER,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'patient',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientSleepLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientNutritionLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "mealType" TEXT NOT NULL,
    "description" TEXT,
    "calories" INTEGER,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "fiber" DOUBLE PRECISION,
    "sugar" DOUBLE PRECISION,
    "sodium" DOUBLE PRECISION,
    "photoUrl" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'patient',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientNutritionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDeviceConnection" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "terraUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "PatientDeviceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientStreak" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "streakType" "StreakType" NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "streakStartedAt" TIMESTAMP(3),
    "freezesUsed" INTEGER NOT NULL DEFAULT 0,
    "freezesAllowed" INTEGER NOT NULL DEFAULT 1,
    "lastFreezeAt" TIMESTAMP(3),

    CONSTRAINT "PatientStreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "AchievementCategory" NOT NULL,
    "icon" TEXT,
    "points" INTEGER NOT NULL DEFAULT 10,
    "criteria" JSONB NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "tier" "AchievementTier" NOT NULL DEFAULT 'BRONZE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAchievement" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "achievementId" INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "PatientAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPoints" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "levelName" TEXT NOT NULL DEFAULT 'Beginner',
    "achievementPoints" INTEGER NOT NULL DEFAULT 0,
    "streakPoints" INTEGER NOT NULL DEFAULT 0,
    "activityPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PatientPoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsHistory" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,

    CONSTRAINT "PointsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ChallengeType" NOT NULL,
    "imageUrl" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "targetUnit" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 100,
    "badge" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeParticipant" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "challengeId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "rank" INTEGER,

    CONSTRAINT "ChallengeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_email_key" ON "Influencer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_promoCode_key" ON "Influencer"("promoCode");

-- CreateIndex
CREATE INDEX "Influencer_promoCode_idx" ON "Influencer"("promoCode");

-- CreateIndex
CREATE INDEX "Influencer_email_idx" ON "Influencer"("email");

-- CreateIndex
CREATE INDEX "InfluencerBankAccount_influencerId_idx" ON "InfluencerBankAccount"("influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralTracking_patientId_key" ON "ReferralTracking"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralTracking_conversionInvoiceId_key" ON "ReferralTracking"("conversionInvoiceId");

-- CreateIndex
CREATE INDEX "ReferralTracking_influencerId_idx" ON "ReferralTracking"("influencerId");

-- CreateIndex
CREATE INDEX "ReferralTracking_patientId_idx" ON "ReferralTracking"("patientId");

-- CreateIndex
CREATE INDEX "ReferralTracking_referralExpiresAt_idx" ON "ReferralTracking"("referralExpiresAt");

-- CreateIndex
CREATE INDEX "ReferralTracking_isConverted_idx" ON "ReferralTracking"("isConverted");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_invoiceId_key" ON "Commission"("invoiceId");

-- CreateIndex
CREATE INDEX "Commission_influencerId_idx" ON "Commission"("influencerId");

-- CreateIndex
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE INDEX "Commission_payoutId_idx" ON "Commission"("payoutId");

-- CreateIndex
CREATE INDEX "Commission_invoiceId_idx" ON "Commission"("invoiceId");

-- CreateIndex
CREATE INDEX "CommissionPayout_influencerId_idx" ON "CommissionPayout"("influencerId");

-- CreateIndex
CREATE INDEX "CommissionPayout_status_idx" ON "CommissionPayout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateProgram_clinicId_key" ON "AffiliateProgram"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateProgram_clinicId_idx" ON "AffiliateProgram"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateTier_programId_idx" ON "AffiliateTier"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateTier_programId_level_key" ON "AffiliateTier"("programId", "level");

-- CreateIndex
CREATE INDEX "AffiliateReferral_affiliateId_idx" ON "AffiliateReferral"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_referredPatientId_idx" ON "AffiliateReferral"("referredPatientId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_clinicId_idx" ON "AffiliateReferral"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateId_idx" ON "AffiliateCommission"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_clinicId_idx" ON "AffiliateCommission"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_status_idx" ON "AffiliateCommission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_userId_key" ON "Affiliate"("userId");

-- CreateIndex
CREATE INDEX "Affiliate_clinicId_idx" ON "Affiliate"("clinicId");

-- CreateIndex
CREATE INDEX "Affiliate_status_idx" ON "Affiliate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateOtpCode_affiliateId_key" ON "AffiliateOtpCode"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateApplication_affiliateId_key" ON "AffiliateApplication"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateApplication_clinicId_status_idx" ON "AffiliateApplication"("clinicId", "status");

-- CreateIndex
CREATE INDEX "AffiliateApplication_email_idx" ON "AffiliateApplication"("email");

-- CreateIndex
CREATE INDEX "AffiliateApplication_phone_idx" ON "AffiliateApplication"("phone");

-- CreateIndex
CREATE INDEX "AffiliateRefCode_clinicId_idx" ON "AffiliateRefCode"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateRefCode_affiliateId_idx" ON "AffiliateRefCode"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateRefCode_refCode_idx" ON "AffiliateRefCode"("refCode");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateRefCode_clinicId_refCode_key" ON "AffiliateRefCode"("clinicId", "refCode");

-- CreateIndex
CREATE INDEX "AffiliateCommissionPlan_clinicId_idx" ON "AffiliateCommissionPlan"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateCommissionPlan_isActive_idx" ON "AffiliateCommissionPlan"("isActive");

-- CreateIndex
CREATE INDEX "AffiliatePlanAssignment_clinicId_idx" ON "AffiliatePlanAssignment"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliatePlanAssignment_affiliateId_idx" ON "AffiliatePlanAssignment"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliatePlanAssignment_commissionPlanId_idx" ON "AffiliatePlanAssignment"("commissionPlanId");

-- CreateIndex
CREATE INDEX "AffiliatePlanAssignment_effectiveFrom_effectiveTo_idx" ON "AffiliatePlanAssignment"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_clinicId_idx" ON "AffiliateCommissionEvent"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_affiliateId_idx" ON "AffiliateCommissionEvent"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_status_idx" ON "AffiliateCommissionEvent"("status");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_occurredAt_idx" ON "AffiliateCommissionEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_stripeEventId_idx" ON "AffiliateCommissionEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_payoutId_idx" ON "AffiliateCommissionEvent"("payoutId");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_affiliateId_occurredAt_idx" ON "AffiliateCommissionEvent"("affiliateId", "occurredAt");

-- CreateIndex
CREATE INDEX "AffiliateCommissionEvent_affiliateId_status_idx" ON "AffiliateCommissionEvent"("affiliateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommissionEvent_clinicId_stripeEventId_key" ON "AffiliateCommissionEvent"("clinicId", "stripeEventId");

-- CreateIndex
CREATE INDEX "AffiliateCompetition_clinicId_idx" ON "AffiliateCompetition"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateCompetition_status_idx" ON "AffiliateCompetition"("status");

-- CreateIndex
CREATE INDEX "AffiliateCompetition_startDate_endDate_idx" ON "AffiliateCompetition"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "AffiliateCompetitionEntry_competitionId_rank_idx" ON "AffiliateCompetitionEntry"("competitionId", "rank");

-- CreateIndex
CREATE INDEX "AffiliateCompetitionEntry_affiliateId_idx" ON "AffiliateCompetitionEntry"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCompetitionEntry_competitionId_affiliateId_key" ON "AffiliateCompetitionEntry"("competitionId", "affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateTouch_clinicId_visitorFingerprint_idx" ON "AffiliateTouch"("clinicId", "visitorFingerprint");

-- CreateIndex
CREATE INDEX "AffiliateTouch_clinicId_cookieId_idx" ON "AffiliateTouch"("clinicId", "cookieId");

-- CreateIndex
CREATE INDEX "AffiliateTouch_affiliateId_idx" ON "AffiliateTouch"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateTouch_createdAt_idx" ON "AffiliateTouch"("createdAt");

-- CreateIndex
CREATE INDEX "AffiliateTouch_refCode_idx" ON "AffiliateTouch"("refCode");

-- CreateIndex
CREATE INDEX "AffiliateTouch_affiliateId_convertedAt_idx" ON "AffiliateTouch"("affiliateId", "convertedAt");

-- CreateIndex
CREATE INDEX "AffiliateTouch_refCode_createdAt_idx" ON "AffiliateTouch"("refCode", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateTouch_affiliateId_createdAt_idx" ON "AffiliateTouch"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateTouch_affiliateId_touchType_createdAt_idx" ON "AffiliateTouch"("affiliateId", "touchType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateAttributionConfig_clinicId_key" ON "AffiliateAttributionConfig"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateCommissionTier_planId_idx" ON "AffiliateCommissionTier"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommissionTier_planId_level_key" ON "AffiliateCommissionTier"("planId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommissionTier_planId_name_key" ON "AffiliateCommissionTier"("planId", "name");

-- CreateIndex
CREATE INDEX "AffiliateProductRate_planId_idx" ON "AffiliateProductRate"("planId");

-- CreateIndex
CREATE INDEX "AffiliateProductRate_productSku_idx" ON "AffiliateProductRate"("productSku");

-- CreateIndex
CREATE INDEX "AffiliateProductRate_productCategory_idx" ON "AffiliateProductRate"("productCategory");

-- CreateIndex
CREATE INDEX "AffiliatePromotion_planId_startsAt_endsAt_idx" ON "AffiliatePromotion"("planId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "AffiliatePromotion_isActive_idx" ON "AffiliatePromotion"("isActive");

-- CreateIndex
CREATE INDEX "AffiliatePayoutMethod_affiliateId_idx" ON "AffiliatePayoutMethod"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePayoutMethod_affiliateId_methodType_key" ON "AffiliatePayoutMethod"("affiliateId", "methodType");

-- CreateIndex
CREATE INDEX "AffiliatePayout_clinicId_idx" ON "AffiliatePayout"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliatePayout_affiliateId_idx" ON "AffiliatePayout"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliatePayout_status_idx" ON "AffiliatePayout"("status");

-- CreateIndex
CREATE INDEX "AffiliatePayout_scheduledAt_idx" ON "AffiliatePayout"("scheduledAt");

-- CreateIndex
CREATE INDEX "AffiliateTaxDocument_affiliateId_idx" ON "AffiliateTaxDocument"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateTaxDocument_status_idx" ON "AffiliateTaxDocument"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateTaxDocument_affiliateId_documentType_taxYear_key" ON "AffiliateTaxDocument"("affiliateId", "documentType", "taxYear");

-- CreateIndex
CREATE INDEX "AffiliateFraudAlert_clinicId_idx" ON "AffiliateFraudAlert"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateFraudAlert_affiliateId_idx" ON "AffiliateFraudAlert"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateFraudAlert_status_idx" ON "AffiliateFraudAlert"("status");

-- CreateIndex
CREATE INDEX "AffiliateFraudAlert_severity_idx" ON "AffiliateFraudAlert"("severity");

-- CreateIndex
CREATE INDEX "AffiliateFraudAlert_createdAt_idx" ON "AffiliateFraudAlert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateIpIntel_ipHash_key" ON "AffiliateIpIntel"("ipHash");

-- CreateIndex
CREATE INDEX "AffiliateIpIntel_ipHash_idx" ON "AffiliateIpIntel"("ipHash");

-- CreateIndex
CREATE INDEX "AffiliateIpIntel_expiresAt_idx" ON "AffiliateIpIntel"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateFraudConfig_clinicId_key" ON "AffiliateFraudConfig"("clinicId");

-- CreateIndex
CREATE INDEX "AffiliateFraudConfig_clinicId_idx" ON "AffiliateFraudConfig"("clinicId");

-- CreateIndex
CREATE INDEX "AppointmentType_clinicId_idx" ON "AppointmentType"("clinicId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_idx" ON "Appointment"("clinicId");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_providerId_idx" ON "Appointment"("providerId");

-- CreateIndex
CREATE INDEX "Appointment_startTime_idx" ON "Appointment"("startTime");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_startTime_idx" ON "Appointment"("clinicId", "startTime");

-- CreateIndex
CREATE INDEX "AppointmentReminder_appointmentId_idx" ON "AppointmentReminder"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentReminder_scheduledFor_status_idx" ON "AppointmentReminder"("scheduledFor", "status");

-- CreateIndex
CREATE INDEX "Superbill_clinicId_idx" ON "Superbill"("clinicId");

-- CreateIndex
CREATE INDEX "Superbill_patientId_idx" ON "Superbill"("patientId");

-- CreateIndex
CREATE INDEX "Superbill_providerId_idx" ON "Superbill"("providerId");

-- CreateIndex
CREATE INDEX "Superbill_serviceDate_idx" ON "Superbill"("serviceDate");

-- CreateIndex
CREATE INDEX "SuperbillItem_superbillId_idx" ON "SuperbillItem"("superbillId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCode_clinicId_codeType_code_key" ON "BillingCode"("clinicId", "codeType", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TelehealthSession_meetingId_key" ON "TelehealthSession"("meetingId");

-- CreateIndex
CREATE INDEX "TelehealthSession_clinicId_idx" ON "TelehealthSession"("clinicId");

-- CreateIndex
CREATE INDEX "TelehealthSession_appointmentId_idx" ON "TelehealthSession"("appointmentId");

-- CreateIndex
CREATE INDEX "TelehealthSession_patientId_idx" ON "TelehealthSession"("patientId");

-- CreateIndex
CREATE INDEX "TelehealthSession_providerId_idx" ON "TelehealthSession"("providerId");

-- CreateIndex
CREATE INDEX "TelehealthSession_status_idx" ON "TelehealthSession"("status");

-- CreateIndex
CREATE INDEX "TelehealthSession_scheduledAt_idx" ON "TelehealthSession"("scheduledAt");

-- CreateIndex
CREATE INDEX "TelehealthParticipant_sessionId_idx" ON "TelehealthParticipant"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSubscription_token_key" ON "CalendarSubscription"("token");

-- CreateIndex
CREATE INDEX "CalendarSubscription_providerId_idx" ON "CalendarSubscription"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_resource_createdAt_idx" ON "IdempotencyRecord"("resource", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "HIPAAAuditEntry_userId_createdAt_idx" ON "HIPAAAuditEntry"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HIPAAAuditEntry_eventType_createdAt_idx" ON "HIPAAAuditEntry"("eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HIPAAAuditEntry_patientId_createdAt_idx" ON "HIPAAAuditEntry"("patientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HIPAAAuditEntry_clinicId_createdAt_idx" ON "HIPAAAuditEntry"("clinicId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HIPAAAuditEntry_resourceType_resourceId_idx" ON "HIPAAAuditEntry"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "HIPAAAuditEntry_createdAt_idx" ON "HIPAAAuditEntry"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "HIPAAAuditEntry_outcome_createdAt_idx" ON "HIPAAAuditEntry"("outcome", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HIPAAAuditEntry_requestId_idx" ON "HIPAAAuditEntry"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_providerId_key" ON "User"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_influencerId_key" ON "User"("influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_patientId_key" ON "User"("patientId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "User_clinicId_idx" ON "User"("clinicId");

-- CreateIndex
CREATE INDEX "User_activeClinicId_idx" ON "User"("activeClinicId");

-- CreateIndex
CREATE INDEX "UserClinic_userId_idx" ON "UserClinic"("userId");

-- CreateIndex
CREATE INDEX "UserClinic_clinicId_idx" ON "UserClinic"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "UserClinic_userId_clinicId_key" ON "UserClinic"("userId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_token_key" ON "UserSession"("token");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_refreshToken_key" ON "UserSession"("refreshToken");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_refreshTokenHash_key" ON "UserSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "UserSession_token_idx" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "UserSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_refreshTokenHash_idx" ON "UserSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "LoginAudit_email_createdAt_idx" ON "LoginAudit"("email", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoginAudit_outcome_createdAt_idx" ON "LoginAudit"("outcome", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoginAudit_clinicId_createdAt_idx" ON "LoginAudit"("clinicId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoginAudit_requestId_idx" ON "LoginAudit"("requestId");

-- CreateIndex
CREATE INDEX "UserAuditLog_userId_createdAt_idx" ON "UserAuditLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserAuditLog_action_createdAt_idx" ON "UserAuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicInviteCode_code_key" ON "ClinicInviteCode"("code");

-- CreateIndex
CREATE INDEX "ClinicInviteCode_code_idx" ON "ClinicInviteCode"("code");

-- CreateIndex
CREATE INDEX "ClinicInviteCode_clinicId_idx" ON "ClinicInviteCode"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalInvite_tokenHash_key" ON "PatientPortalInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PatientPortalInvite_patientId_idx" ON "PatientPortalInvite"("patientId");

-- CreateIndex
CREATE INDEX "PatientPortalInvite_tokenHash_idx" ON "PatientPortalInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PatientPortalInvite_expiresAt_idx" ON "PatientPortalInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_code_expiresAt_idx" ON "PhoneOtp"("phone", "code", "expiresAt");

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_idx" ON "PhoneOtp"("phone");

-- CreateIndex
CREATE INDEX "EmailVerificationCode_email_type_idx" ON "EmailVerificationCode"("email", "type");

-- CreateIndex
CREATE INDEX "EmailVerificationCode_expiresAt_idx" ON "EmailVerificationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_prescriptionProcessed_idx" ON "Invoice"("prescriptionProcessed");

-- CreateIndex
CREATE INDEX "Invoice_clinicId_idx" ON "Invoice"("clinicId");

-- CreateIndex
CREATE INDEX "Invoice_patientId_idx" ON "Invoice"("patientId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Payment_clinicId_idx" ON "Payment"("clinicId");

-- CreateIndex
CREATE INDEX "Payment_patientId_idx" ON "Payment"("patientId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliation_stripeEventId_key" ON "PaymentReconciliation"("stripeEventId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_stripePaymentIntentId_idx" ON "PaymentReconciliation"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_stripeChargeId_idx" ON "PaymentReconciliation"("stripeChargeId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_stripeCustomerId_idx" ON "PaymentReconciliation"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_customerEmail_idx" ON "PaymentReconciliation"("customerEmail");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_status_idx" ON "PaymentReconciliation"("status");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_createdAt_idx" ON "PaymentReconciliation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_stripePaymentMethodId_key" ON "PaymentMethod"("stripePaymentMethodId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_stripeProductId_key" ON "Product"("stripeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_stripePriceId_key" ON "Product"("stripePriceId");

-- CreateIndex
CREATE INDEX "Product_clinicId_isActive_idx" ON "Product"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "Product_clinicId_category_idx" ON "Product"("clinicId", "category");

-- CreateIndex
CREATE INDEX "Product_stripeProductId_idx" ON "Product"("stripeProductId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_stripeCouponId_key" ON "DiscountCode"("stripeCouponId");

-- CreateIndex
CREATE INDEX "DiscountCode_clinicId_isActive_idx" ON "DiscountCode"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "DiscountCode_code_idx" ON "DiscountCode"("code");

-- CreateIndex
CREATE INDEX "DiscountCode_affiliateId_idx" ON "DiscountCode"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_clinicId_code_key" ON "DiscountCode"("clinicId", "code");

-- CreateIndex
CREATE INDEX "DiscountUsage_discountCodeId_idx" ON "DiscountUsage"("discountCodeId");

-- CreateIndex
CREATE INDEX "DiscountUsage_patientId_idx" ON "DiscountUsage"("patientId");

-- CreateIndex
CREATE INDEX "Promotion_clinicId_isActive_idx" ON "Promotion"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "Promotion_startsAt_endsAt_idx" ON "Promotion"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBundle_stripeProductId_key" ON "ProductBundle"("stripeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBundle_stripePriceId_key" ON "ProductBundle"("stripePriceId");

-- CreateIndex
CREATE INDEX "ProductBundle_clinicId_isActive_idx" ON "ProductBundle"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "ProductBundleItem_bundleId_idx" ON "ProductBundleItem"("bundleId");

-- CreateIndex
CREATE INDEX "ProductBundleItem_productId_idx" ON "ProductBundleItem"("productId");

-- CreateIndex
CREATE INDEX "PricingRule_clinicId_isActive_priority_idx" ON "PricingRule"("clinicId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "ScheduledPayment_clinicId_scheduledDate_idx" ON "ScheduledPayment"("clinicId", "scheduledDate");

-- CreateIndex
CREATE INDEX "ScheduledPayment_patientId_idx" ON "ScheduledPayment"("patientId");

-- CreateIndex
CREATE INDEX "ScheduledPayment_status_scheduledDate_idx" ON "ScheduledPayment"("status", "scheduledDate");

-- CreateIndex
CREATE INDEX "SystemSettings_category_idx" ON "SystemSettings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_clinicId_category_key_key" ON "SystemSettings"("clinicId", "category", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_subdomain_key" ON "Clinic"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_customDomain_key" ON "Clinic"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_stripeAccountId_key" ON "Clinic"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_lifefileInboundPath_key" ON "Clinic"("lifefileInboundPath");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_zoomAccountId_key" ON "Clinic"("zoomAccountId");

-- CreateIndex
CREATE INDEX "Clinic_subdomain_idx" ON "Clinic"("subdomain");

-- CreateIndex
CREATE INDEX "Clinic_status_idx" ON "Clinic"("status");

-- CreateIndex
CREATE INDEX "Clinic_customDomain_idx" ON "Clinic"("customDomain");

-- CreateIndex
CREATE INDEX "ClinicAuditLog_clinicId_createdAt_idx" ON "ClinicAuditLog"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicAuditLog_action_idx" ON "ClinicAuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "LabReport_documentId_key" ON "LabReport"("documentId");

-- CreateIndex
CREATE INDEX "LabReport_patientId_idx" ON "LabReport"("patientId");

-- CreateIndex
CREATE INDEX "LabReport_clinicId_idx" ON "LabReport"("clinicId");

-- CreateIndex
CREATE INDEX "LabReportResult_labReportId_idx" ON "LabReportResult"("labReportId");

-- CreateIndex
CREATE INDEX "SOAPNote_patientId_status_idx" ON "SOAPNote"("patientId", "status");

-- CreateIndex
CREATE INDEX "SOAPNoteRevision_soapNoteId_idx" ON "SOAPNoteRevision"("soapNoteId");

-- CreateIndex
CREATE INDEX "AIConversation_sessionId_idx" ON "AIConversation"("sessionId");

-- CreateIndex
CREATE INDEX "AIConversation_patientId_idx" ON "AIConversation"("patientId");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");

-- CreateIndex
CREATE INDEX "CarePlan_clinicId_idx" ON "CarePlan"("clinicId");

-- CreateIndex
CREATE INDEX "CarePlan_patientId_idx" ON "CarePlan"("patientId");

-- CreateIndex
CREATE INDEX "CarePlan_status_idx" ON "CarePlan"("status");

-- CreateIndex
CREATE INDEX "CarePlanTemplate_clinicId_idx" ON "CarePlanTemplate"("clinicId");

-- CreateIndex
CREATE INDEX "CarePlanGoal_carePlanId_idx" ON "CarePlanGoal"("carePlanId");

-- CreateIndex
CREATE INDEX "CarePlanActivity_carePlanId_idx" ON "CarePlanActivity"("carePlanId");

-- CreateIndex
CREATE INDEX "CarePlanProgress_carePlanId_idx" ON "CarePlanProgress"("carePlanId");

-- CreateIndex
CREATE INDEX "CarePlanProgress_recordedAt_idx" ON "CarePlanProgress"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_policyId_key" ON "Policy"("policyId");

-- CreateIndex
CREATE INDEX "Policy_status_idx" ON "Policy"("status");

-- CreateIndex
CREATE INDEX "Policy_policyId_idx" ON "Policy"("policyId");

-- CreateIndex
CREATE INDEX "PolicyApproval_policyId_idx" ON "PolicyApproval"("policyId");

-- CreateIndex
CREATE INDEX "PolicyApproval_userId_idx" ON "PolicyApproval"("userId");

-- CreateIndex
CREATE INDEX "PolicyApproval_approvedAt_idx" ON "PolicyApproval"("approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyApproval_policyId_userId_approvalType_key" ON "PolicyApproval"("policyId", "userId", "approvalType");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgment_policyId_idx" ON "PolicyAcknowledgment"("policyId");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgment_userId_idx" ON "PolicyAcknowledgment"("userId");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgment_clinicId_idx" ON "PolicyAcknowledgment"("clinicId");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgment_acknowledgedAt_idx" ON "PolicyAcknowledgment"("acknowledgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcknowledgment_policyId_userId_key" ON "PolicyAcknowledgment"("policyId", "userId");

-- CreateIndex
CREATE INDEX "AddressValidationLog_eventType_idx" ON "AddressValidationLog"("eventType");

-- CreateIndex
CREATE INDEX "AddressValidationLog_clinicId_idx" ON "AddressValidationLog"("clinicId");

-- CreateIndex
CREATE INDEX "AddressValidationLog_source_idx" ON "AddressValidationLog"("source");

-- CreateIndex
CREATE INDEX "AddressValidationLog_createdAt_idx" ON "AddressValidationLog"("createdAt");

-- CreateIndex
CREATE INDEX "PatientShippingUpdate_clinicId_patientId_idx" ON "PatientShippingUpdate"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "PatientShippingUpdate_trackingNumber_idx" ON "PatientShippingUpdate"("trackingNumber");

-- CreateIndex
CREATE INDEX "PatientShippingUpdate_lifefileOrderId_idx" ON "PatientShippingUpdate"("lifefileOrderId");

-- CreateIndex
CREATE INDEX "PatientShippingUpdate_status_idx" ON "PatientShippingUpdate"("status");

-- CreateIndex
CREATE INDEX "PatientShippingUpdate_clinicId_matchedAt_idx" ON "PatientShippingUpdate"("clinicId", "matchedAt");

-- CreateIndex
CREATE INDEX "ShipmentLabel_clinicId_patientId_idx" ON "ShipmentLabel"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "ShipmentLabel_trackingNumber_idx" ON "ShipmentLabel"("trackingNumber");

-- CreateIndex
CREATE INDEX "ShipmentLabel_clinicId_createdAt_idx" ON "ShipmentLabel"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "PackagePhoto_clinicId_createdAt_idx" ON "PackagePhoto"("clinicId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PackagePhoto_lifefileId_idx" ON "PackagePhoto"("lifefileId");

-- CreateIndex
CREATE INDEX "PackagePhoto_trackingNumber_idx" ON "PackagePhoto"("trackingNumber");

-- CreateIndex
CREATE INDEX "PackagePhoto_patientId_idx" ON "PackagePhoto"("patientId");

-- CreateIndex
CREATE INDEX "PackagePhoto_capturedById_idx" ON "PackagePhoto"("capturedById");

-- CreateIndex
CREATE INDEX "PackagePhoto_matched_idx" ON "PackagePhoto"("matched");

-- CreateIndex
CREATE INDEX "PackagePhoto_assignedClinicId_idx" ON "PackagePhoto"("assignedClinicId");

-- CreateIndex
CREATE UNIQUE INDEX "RefillQueue_orderId_key" ON "RefillQueue"("orderId");

-- CreateIndex
CREATE INDEX "RefillQueue_clinicId_status_idx" ON "RefillQueue"("clinicId", "status");

-- CreateIndex
CREATE INDEX "RefillQueue_patientId_idx" ON "RefillQueue"("patientId");

-- CreateIndex
CREATE INDEX "RefillQueue_subscriptionId_idx" ON "RefillQueue"("subscriptionId");

-- CreateIndex
CREATE INDEX "RefillQueue_nextRefillDate_idx" ON "RefillQueue"("nextRefillDate");

-- CreateIndex
CREATE INDEX "RefillQueue_status_nextRefillDate_idx" ON "RefillQueue"("status", "nextRefillDate");

-- CreateIndex
CREATE INDEX "RefillQueue_parentRefillId_idx" ON "RefillQueue"("parentRefillId");

-- CreateIndex
CREATE INDEX "IntakeFormTemplate_treatmentType_isActive_idx" ON "IntakeFormTemplate"("treatmentType", "isActive");

-- CreateIndex
CREATE INDEX "IntakeFormTemplate_providerId_idx" ON "IntakeFormTemplate"("providerId");

-- CreateIndex
CREATE INDEX "IntakeFormTemplate_createdById_idx" ON "IntakeFormTemplate"("createdById");

-- CreateIndex
CREATE INDEX "IntakeFormQuestion_templateId_orderIndex_idx" ON "IntakeFormQuestion"("templateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeFormSubmission_formLinkId_key" ON "IntakeFormSubmission"("formLinkId");

-- CreateIndex
CREATE INDEX "IntakeFormSubmission_patientId_status_idx" ON "IntakeFormSubmission"("patientId", "status");

-- CreateIndex
CREATE INDEX "IntakeFormSubmission_templateId_idx" ON "IntakeFormSubmission"("templateId");

-- CreateIndex
CREATE INDEX "IntakeFormResponse_submissionId_idx" ON "IntakeFormResponse"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeFormResponse_submissionId_questionId_key" ON "IntakeFormResponse"("submissionId", "questionId");

-- CreateIndex
CREATE INDEX "IntakeFormLink_patientEmail_isActive_idx" ON "IntakeFormLink"("patientEmail", "isActive");

-- CreateIndex
CREATE INDEX "IntakeFormLink_expiresAt_idx" ON "IntakeFormLink"("expiresAt");

-- CreateIndex
CREATE INDEX "IntakeFormLink_salesRepId_idx" ON "IntakeFormLink"("salesRepId");

-- CreateIndex
CREATE INDEX "IntakeFormLink_createdById_idx" ON "IntakeFormLink"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeFormDraft_sessionId_key" ON "IntakeFormDraft"("sessionId");

-- CreateIndex
CREATE INDEX "IntakeFormDraft_patientId_status_idx" ON "IntakeFormDraft"("patientId", "status");

-- CreateIndex
CREATE INDEX "IntakeFormDraft_sessionId_idx" ON "IntakeFormDraft"("sessionId");

-- CreateIndex
CREATE INDEX "IntakeFormDraft_expiresAt_idx" ON "IntakeFormDraft"("expiresAt");

-- CreateIndex
CREATE INDEX "WebhookLog_endpoint_createdAt_idx" ON "WebhookLog"("endpoint", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookLog_status_createdAt_idx" ON "WebhookLog"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookLog_source_eventId_idx" ON "WebhookLog"("source", "eventId");

-- CreateIndex
CREATE INDEX "WebhookLog_source_status_idx" ON "WebhookLog"("source", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookLog_source_eventId_key" ON "WebhookLog"("source", "eventId");

-- CreateIndex
CREATE INDEX "Integration_provider_status_idx" ON "Integration"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_clinicId_name_key" ON "Integration"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_status_idx" ON "ApiKey"("status");

-- CreateIndex
CREATE INDEX "ApiUsageLog_apiKeyId_createdAt_idx" ON "ApiUsageLog"("apiKeyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApiUsageLog_endpoint_createdAt_idx" ON "ApiUsageLog"("endpoint", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookConfig_isActive_idx" ON "WebhookConfig"("isActive");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_status_idx" ON "WebhookDelivery"("webhookId", "status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookDelivery_source_idx" ON "WebhookDelivery"("source");

-- CreateIndex
CREATE INDEX "IntegrationLog_integrationId_createdAt_idx" ON "IntegrationLog"("integrationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IntegrationLog_status_createdAt_idx" ON "IntegrationLog"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperTool_name_key" ON "DeveloperTool"("name");

-- CreateIndex
CREATE INDEX "DeveloperTool_category_idx" ON "DeveloperTool"("category");

-- CreateIndex
CREATE INDEX "InternalMessage_senderId_createdAt_idx" ON "InternalMessage"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "InternalMessage_recipientId_isRead_idx" ON "InternalMessage"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "InternalMessage_channelId_createdAt_idx" ON "InternalMessage"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "MessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "SmsLog_messageSid_key" ON "SmsLog"("messageSid");

-- CreateIndex
CREATE INDEX "SmsLog_patientId_createdAt_idx" ON "SmsLog"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsLog_fromPhone_idx" ON "SmsLog"("fromPhone");

-- CreateIndex
CREATE INDEX "SmsLog_toPhone_idx" ON "SmsLog"("toPhone");

-- CreateIndex
CREATE INDEX "SmsLog_clinicId_idx" ON "SmsLog"("clinicId");

-- CreateIndex
CREATE INDEX "SmsLog_status_createdAt_idx" ON "SmsLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SmsLog_messageSid_status_idx" ON "SmsLog"("messageSid", "status");

-- CreateIndex
CREATE INDEX "SmsLog_templateType_patientId_idx" ON "SmsLog"("templateType", "patientId");

-- CreateIndex
CREATE INDEX "SmsOptOut_phone_clinicId_idx" ON "SmsOptOut"("phone", "clinicId");

-- CreateIndex
CREATE INDEX "SmsOptOut_phone_idx" ON "SmsOptOut"("phone");

-- CreateIndex
CREATE INDEX "SmsOptOut_clinicId_idx" ON "SmsOptOut"("clinicId");

-- CreateIndex
CREATE INDEX "SmsOptOut_patientId_idx" ON "SmsOptOut"("patientId");

-- CreateIndex
CREATE INDEX "SmsQuietHours_clinicId_isActive_idx" ON "SmsQuietHours"("clinicId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SmsQuietHours_clinicId_name_key" ON "SmsQuietHours"("clinicId", "name");

-- CreateIndex
CREATE INDEX "SmsRateLimit_phone_clinicId_idx" ON "SmsRateLimit"("phone", "clinicId");

-- CreateIndex
CREATE INDEX "SmsRateLimit_phone_idx" ON "SmsRateLimit"("phone");

-- CreateIndex
CREATE INDEX "PatientChatMessage_patientId_createdAt_idx" ON "PatientChatMessage"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientChatMessage_clinicId_idx" ON "PatientChatMessage"("clinicId");

-- CreateIndex
CREATE INDEX "PatientChatMessage_threadId_idx" ON "PatientChatMessage"("threadId");

-- CreateIndex
CREATE INDEX "PatientChatMessage_status_idx" ON "PatientChatMessage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_patientId_idx" ON "PushSubscription"("patientId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_isArchived_idx" ON "Notification"("userId", "isArchived");

-- CreateIndex
CREATE INDEX "Notification_clinicId_category_idx" ON "Notification"("clinicId", "category");

-- CreateIndex
CREATE INDEX "Notification_sourceType_sourceId_idx" ON "Notification"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_messageId_key" ON "EmailLog"("messageId");

-- CreateIndex
CREATE INDEX "EmailLog_recipientEmail_idx" ON "EmailLog"("recipientEmail");

-- CreateIndex
CREATE INDEX "EmailLog_recipientUserId_idx" ON "EmailLog"("recipientUserId");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_messageId_idx" ON "EmailLog"("messageId");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailLog_clinicId_createdAt_idx" ON "EmailLog"("clinicId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailLog_sourceType_sourceId_idx" ON "EmailLog"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_status_scheduledFor_idx" ON "ScheduledEmail"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledEmail_recipientUserId_idx" ON "ScheduledEmail"("recipientUserId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_clinicId_idx" ON "ScheduledEmail"("clinicId");

-- CreateIndex
CREATE INDEX "ScheduledEmail_createdAt_idx" ON "ScheduledEmail"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_key" ON "UserNotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "UserNotificationPreference_userId_idx" ON "UserNotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_stripeCustomerId_key" ON "Patient"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Patient_clinicId_idx" ON "Patient"("clinicId");

-- CreateIndex
CREATE INDEX "Patient_profileStatus_idx" ON "Patient"("profileStatus");

-- CreateIndex
CREATE INDEX "Patient_clinicId_emailHash_dobHash_idx" ON "Patient"("clinicId", "emailHash", "dobHash");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_patientId_key" ON "Patient"("clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientDocument_sourceSubmissionId_key" ON "PatientDocument"("sourceSubmissionId");

-- CreateIndex
CREATE INDEX "PatientDocument_patientId_idx" ON "PatientDocument"("patientId");

-- CreateIndex
CREATE INDEX "PatientDocument_clinicId_patientId_idx" ON "PatientDocument"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "PatientDocument_patientId_category_idx" ON "PatientDocument"("patientId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PatientCounter_clinicId_key" ON "PatientCounter"("clinicId");

-- CreateIndex
CREATE INDEX "PatientSalesRepAssignment_salesRepId_clinicId_isActive_idx" ON "PatientSalesRepAssignment"("salesRepId", "clinicId", "isActive");

-- CreateIndex
CREATE INDEX "PatientSalesRepAssignment_patientId_isActive_idx" ON "PatientSalesRepAssignment"("patientId", "isActive");

-- CreateIndex
CREATE INDEX "PatientSalesRepAssignment_clinicId_idx" ON "PatientSalesRepAssignment"("clinicId");

-- CreateIndex
CREATE INDEX "PatientPhoto_patientId_type_idx" ON "PatientPhoto"("patientId", "type");

-- CreateIndex
CREATE INDEX "PatientPhoto_patientId_createdAt_idx" ON "PatientPhoto"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientPhoto_clinicId_idx" ON "PatientPhoto"("clinicId");

-- CreateIndex
CREATE INDEX "PatientPhoto_type_verificationStatus_idx" ON "PatientPhoto"("type", "verificationStatus");

-- CreateIndex
CREATE INDEX "PatientPhoto_isDeleted_idx" ON "PatientPhoto"("isDeleted");

-- CreateIndex
CREATE INDEX "PatientNote_patientId_idx" ON "PatientNote"("patientId");

-- CreateIndex
CREATE INDEX "PatientNote_clinicId_idx" ON "PatientNote"("clinicId");

-- CreateIndex
CREATE INDEX "PatientNote_createdById_idx" ON "PatientNote"("createdById");

-- CreateIndex
CREATE INDEX "PharmacyInvoiceUpload_clinicId_idx" ON "PharmacyInvoiceUpload"("clinicId");

-- CreateIndex
CREATE INDEX "PharmacyInvoiceUpload_status_idx" ON "PharmacyInvoiceUpload"("status");

-- CreateIndex
CREATE INDEX "PharmacyInvoiceUpload_createdAt_idx" ON "PharmacyInvoiceUpload"("createdAt");

-- CreateIndex
CREATE INDEX "PharmacyInvoiceUpload_paymentStatus_idx" ON "PharmacyInvoiceUpload"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyInvoiceUpload_clinicId_invoiceNumber_key" ON "PharmacyInvoiceUpload"("clinicId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "PharmacyInvoiceLineItem_invoiceUploadId_idx" ON "PharmacyInvoiceLineItem"("invoiceUploadId");

-- CreateIndex
CREATE INDEX "PharmacyInvoiceLineItem_lifefileOrderId_idx" ON "PharmacyInvoiceLineItem"("lifefileOrderId");

-- CreateIndex
CREATE INDEX "PharmacyInvoiceLineItem_matchStatus_idx" ON "PharmacyInvoiceLineItem"("matchStatus");

-- CreateIndex
CREATE INDEX "PharmacyInvoiceLineItem_matchedOrderId_idx" ON "PharmacyInvoiceLineItem"("matchedOrderId");

-- CreateIndex
CREATE INDEX "PharmacyConsolidatedStatement_clinicId_idx" ON "PharmacyConsolidatedStatement"("clinicId");

-- CreateIndex
CREATE INDEX "PharmacyConsolidatedStatement_createdAt_idx" ON "PharmacyConsolidatedStatement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicPlatformFeeConfig_clinicId_key" ON "ClinicPlatformFeeConfig"("clinicId");

-- CreateIndex
CREATE INDEX "ClinicPlatformFeeConfig_isActive_idx" ON "ClinicPlatformFeeConfig"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeeEvent_orderId_key" ON "PlatformFeeEvent"("orderId");

-- CreateIndex
CREATE INDEX "PlatformFeeEvent_clinicId_idx" ON "PlatformFeeEvent"("clinicId");

-- CreateIndex
CREATE INDEX "PlatformFeeEvent_createdAt_idx" ON "PlatformFeeEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformFeeEvent_status_idx" ON "PlatformFeeEvent"("status");

-- CreateIndex
CREATE INDEX "PlatformFeeEvent_feeType_idx" ON "PlatformFeeEvent"("feeType");

-- CreateIndex
CREATE INDEX "PlatformFeeEvent_invoiceId_idx" ON "PlatformFeeEvent"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicPlatformInvoice_invoiceNumber_key" ON "ClinicPlatformInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicPlatformInvoice_stripeInvoiceId_key" ON "ClinicPlatformInvoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "ClinicPlatformInvoice_clinicId_idx" ON "ClinicPlatformInvoice"("clinicId");

-- CreateIndex
CREATE INDEX "ClinicPlatformInvoice_status_idx" ON "ClinicPlatformInvoice"("status");

-- CreateIndex
CREATE INDEX "ClinicPlatformInvoice_periodStart_periodEnd_idx" ON "ClinicPlatformInvoice"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ClinicPlatformInvoice_dueDate_idx" ON "ClinicPlatformInvoice"("dueDate");

-- CreateIndex
CREATE INDEX "ClinicCreditNote_invoiceId_idx" ON "ClinicCreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "ClinicCreditNote_status_idx" ON "ClinicCreditNote"("status");

-- CreateIndex
CREATE INDEX "Order_cancelledAt_idx" ON "Order"("cancelledAt");

-- CreateIndex
CREATE INDEX "Order_assignedProviderId_idx" ON "Order"("assignedProviderId");

-- CreateIndex
CREATE INDEX "Order_clinicId_status_idx" ON "Order"("clinicId", "status");

-- CreateIndex
CREATE INDEX "Order_patientId_idx" ON "Order"("patientId");

-- CreateIndex
CREATE INDEX "Order_providerId_idx" ON "Order"("providerId");

-- CreateIndex
CREATE INDEX "Order_trackingNumber_idx" ON "Order"("trackingNumber");

-- CreateIndex
CREATE INDEX "Order_lifefileOrderId_idx" ON "Order"("lifefileOrderId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_lastWebhookAt_idx" ON "Order"("lastWebhookAt");

-- CreateIndex
CREATE INDEX "Order_patientId_createdAt_idx" ON "Order"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_clinicId_createdAt_idx" ON "Order"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "Rx_orderId_idx" ON "Rx"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");

-- CreateIndex
CREATE INDEX "RxOrderSet_clinicId_isActive_idx" ON "RxOrderSet"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "RxOrderSetItem_orderSetId_idx" ON "RxOrderSetItem"("orderSetId");

-- CreateIndex
CREATE INDEX "PatientPrescriptionCycle_clinicId_idx" ON "PatientPrescriptionCycle"("clinicId");

-- CreateIndex
CREATE INDEX "PatientPrescriptionCycle_patientId_idx" ON "PatientPrescriptionCycle"("patientId");

-- CreateIndex
CREATE INDEX "PatientPrescriptionCycle_nextEligibleAt_idx" ON "PatientPrescriptionCycle"("nextEligibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPrescriptionCycle_clinicId_patientId_medicationKey_key" ON "PatientPrescriptionCycle"("clinicId", "patientId", "medicationKey");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_npi_key" ON "Provider"("npi");

-- CreateIndex
CREATE INDEX "Provider_status_idx" ON "Provider"("status");

-- CreateIndex
CREATE INDEX "Provider_isEonproProvider_idx" ON "Provider"("isEonproProvider");

-- CreateIndex
CREATE INDEX "Provider_clinicId_idx" ON "Provider"("clinicId");

-- CreateIndex
CREATE INDEX "ProviderLicense_providerId_idx" ON "ProviderLicense"("providerId");

-- CreateIndex
CREATE INDEX "ProviderLicense_expiresAt_idx" ON "ProviderLicense"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderLicense_providerId_state_key" ON "ProviderLicense"("providerId", "state");

-- CreateIndex
CREATE INDEX "ProviderClinic_providerId_idx" ON "ProviderClinic"("providerId");

-- CreateIndex
CREATE INDEX "ProviderClinic_clinicId_idx" ON "ProviderClinic"("clinicId");

-- CreateIndex
CREATE INDEX "ProviderClinic_isActive_idx" ON "ProviderClinic"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderClinic_providerId_clinicId_key" ON "ProviderClinic"("providerId", "clinicId");

-- CreateIndex
CREATE INDEX "ProviderAvailability_providerId_idx" ON "ProviderAvailability"("providerId");

-- CreateIndex
CREATE INDEX "ProviderAvailability_dayOfWeek_idx" ON "ProviderAvailability"("dayOfWeek");

-- CreateIndex
CREATE INDEX "ProviderAvailability_providerId_clinicId_idx" ON "ProviderAvailability"("providerId", "clinicId");

-- CreateIndex
CREATE INDEX "ProviderTimeOff_providerId_idx" ON "ProviderTimeOff"("providerId");

-- CreateIndex
CREATE INDEX "ProviderTimeOff_startDate_endDate_idx" ON "ProviderTimeOff"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "ProviderDateOverride_providerId_date_idx" ON "ProviderDateOverride"("providerId", "date");

-- CreateIndex
CREATE INDEX "ProviderDateOverride_providerId_clinicId_date_idx" ON "ProviderDateOverride"("providerId", "clinicId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderDateOverride_providerId_date_startTime_clinicId_key" ON "ProviderDateOverride"("providerId", "date", "startTime", "clinicId");

-- CreateIndex
CREATE INDEX "ProviderCalendarIntegration_providerId_idx" ON "ProviderCalendarIntegration"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCalendarIntegration_providerId_provider_key" ON "ProviderCalendarIntegration"("providerId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRoutingConfig_clinicId_key" ON "ProviderRoutingConfig"("clinicId");

-- CreateIndex
CREATE INDEX "ProviderCompensationPlan_clinicId_idx" ON "ProviderCompensationPlan"("clinicId");

-- CreateIndex
CREATE INDEX "ProviderCompensationPlan_providerId_idx" ON "ProviderCompensationPlan"("providerId");

-- CreateIndex
CREATE INDEX "ProviderCompensationPlan_isActive_idx" ON "ProviderCompensationPlan"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCompensationPlan_clinicId_providerId_key" ON "ProviderCompensationPlan"("clinicId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCompensationEvent_orderId_key" ON "ProviderCompensationEvent"("orderId");

-- CreateIndex
CREATE INDEX "ProviderCompensationEvent_clinicId_providerId_idx" ON "ProviderCompensationEvent"("clinicId", "providerId");

-- CreateIndex
CREATE INDEX "ProviderCompensationEvent_clinicId_createdAt_idx" ON "ProviderCompensationEvent"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderCompensationEvent_providerId_status_idx" ON "ProviderCompensationEvent"("providerId", "status");

-- CreateIndex
CREATE INDEX "ProviderCompensationEvent_status_idx" ON "ProviderCompensationEvent"("status");

-- CreateIndex
CREATE INDEX "ProviderCompensationEvent_createdAt_idx" ON "ProviderCompensationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ReportTemplate_clinicId_idx" ON "ReportTemplate"("clinicId");

-- CreateIndex
CREATE INDEX "ReportTemplate_createdById_idx" ON "ReportTemplate"("createdById");

-- CreateIndex
CREATE INDEX "ReportTemplate_dataSource_idx" ON "ReportTemplate"("dataSource");

-- CreateIndex
CREATE INDEX "ReportTemplate_isSystemTemplate_idx" ON "ReportTemplate"("isSystemTemplate");

-- CreateIndex
CREATE INDEX "ReportSchedule_isActive_nextRunAt_idx" ON "ReportSchedule"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "ReportSchedule_templateId_idx" ON "ReportSchedule"("templateId");

-- CreateIndex
CREATE INDEX "ReportSchedule_clinicId_idx" ON "ReportSchedule"("clinicId");

-- CreateIndex
CREATE INDEX "RevenueRecognitionEntry_clinicId_status_idx" ON "RevenueRecognitionEntry"("clinicId", "status");

-- CreateIndex
CREATE INDEX "RevenueRecognitionEntry_recognitionEnd_idx" ON "RevenueRecognitionEntry"("recognitionEnd");

-- CreateIndex
CREATE INDEX "RevenueRecognitionEntry_stripeChargeId_idx" ON "RevenueRecognitionEntry"("stripeChargeId");

-- CreateIndex
CREATE INDEX "RevenueRecognitionEntry_stripeSubscriptionId_idx" ON "RevenueRecognitionEntry"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "RevenueRecognitionJournal_entryId_idx" ON "RevenueRecognitionJournal"("entryId");

-- CreateIndex
CREATE INDEX "RevenueRecognitionJournal_periodStart_periodEnd_idx" ON "RevenueRecognitionJournal"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "SalesRepRefCode_clinicId_idx" ON "SalesRepRefCode"("clinicId");

-- CreateIndex
CREATE INDEX "SalesRepRefCode_salesRepId_idx" ON "SalesRepRefCode"("salesRepId");

-- CreateIndex
CREATE INDEX "SalesRepRefCode_refCode_idx" ON "SalesRepRefCode"("refCode");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRepRefCode_clinicId_refCode_key" ON "SalesRepRefCode"("clinicId", "refCode");

-- CreateIndex
CREATE INDEX "SalesRepTouch_clinicId_visitorFingerprint_idx" ON "SalesRepTouch"("clinicId", "visitorFingerprint");

-- CreateIndex
CREATE INDEX "SalesRepTouch_clinicId_cookieId_idx" ON "SalesRepTouch"("clinicId", "cookieId");

-- CreateIndex
CREATE INDEX "SalesRepTouch_salesRepId_idx" ON "SalesRepTouch"("salesRepId");

-- CreateIndex
CREATE INDEX "SalesRepTouch_createdAt_idx" ON "SalesRepTouch"("createdAt");

-- CreateIndex
CREATE INDEX "SalesRepTouch_refCode_idx" ON "SalesRepTouch"("refCode");

-- CreateIndex
CREATE INDEX "SalesRepTouch_salesRepId_convertedAt_idx" ON "SalesRepTouch"("salesRepId", "convertedAt");

-- CreateIndex
CREATE INDEX "SalesRepTouch_refCode_createdAt_idx" ON "SalesRepTouch"("refCode", "createdAt");

-- CreateIndex
CREATE INDEX "SalesRepTouch_salesRepId_createdAt_idx" ON "SalesRepTouch"("salesRepId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesRepTouch_salesRepId_touchType_createdAt_idx" ON "SalesRepTouch"("salesRepId", "touchType", "createdAt");

-- CreateIndex
CREATE INDEX "SalesRepCommissionPlan_clinicId_idx" ON "SalesRepCommissionPlan"("clinicId");

-- CreateIndex
CREATE INDEX "SalesRepCommissionPlan_isActive_idx" ON "SalesRepCommissionPlan"("isActive");

-- CreateIndex
CREATE INDEX "SalesRepPlanAssignment_clinicId_idx" ON "SalesRepPlanAssignment"("clinicId");

-- CreateIndex
CREATE INDEX "SalesRepPlanAssignment_salesRepId_idx" ON "SalesRepPlanAssignment"("salesRepId");

-- CreateIndex
CREATE INDEX "SalesRepPlanAssignment_commissionPlanId_idx" ON "SalesRepPlanAssignment"("commissionPlanId");

-- CreateIndex
CREATE INDEX "SalesRepPlanAssignment_effectiveFrom_effectiveTo_idx" ON "SalesRepPlanAssignment"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "SalesRepProductCommission_planId_idx" ON "SalesRepProductCommission"("planId");

-- CreateIndex
CREATE INDEX "SalesRepProductCommission_productId_idx" ON "SalesRepProductCommission"("productId");

-- CreateIndex
CREATE INDEX "SalesRepProductCommission_productBundleId_idx" ON "SalesRepProductCommission"("productBundleId");

-- CreateIndex
CREATE INDEX "SalesRepCommissionEvent_salesRepId_status_idx" ON "SalesRepCommissionEvent"("salesRepId", "status");

-- CreateIndex
CREATE INDEX "SalesRepCommissionEvent_clinicId_occurredAt_idx" ON "SalesRepCommissionEvent"("clinicId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesRepCommissionEvent_status_holdUntil_idx" ON "SalesRepCommissionEvent"("status", "holdUntil");

-- CreateIndex
CREATE INDEX "SalesRepCommissionEvent_salesRepId_occurredAt_idx" ON "SalesRepCommissionEvent"("salesRepId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRepCommissionEvent_clinicId_stripeEventId_key" ON "SalesRepCommissionEvent"("clinicId", "stripeEventId");

-- CreateIndex
CREATE INDEX "SalesRepVolumeCommissionTier_planId_idx" ON "SalesRepVolumeCommissionTier"("planId");

-- CreateIndex
CREATE INDEX "SalesRepVolumeCommissionTier_planId_minSales_idx" ON "SalesRepVolumeCommissionTier"("planId", "minSales");

-- CreateIndex
CREATE INDEX "EmployeeSalary_clinicId_idx" ON "EmployeeSalary"("clinicId");

-- CreateIndex
CREATE INDEX "EmployeeSalary_userId_idx" ON "EmployeeSalary"("userId");

-- CreateIndex
CREATE INDEX "EmployeeSalary_isActive_idx" ON "EmployeeSalary"("isActive");

-- CreateIndex
CREATE INDEX "EmployeeSalary_effectiveFrom_effectiveTo_idx" ON "EmployeeSalary"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSalary_clinicId_userId_isActive_key" ON "EmployeeSalary"("clinicId", "userId", "isActive");

-- CreateIndex
CREATE INDEX "SalesRepOverrideAssignment_clinicId_idx" ON "SalesRepOverrideAssignment"("clinicId");

-- CreateIndex
CREATE INDEX "SalesRepOverrideAssignment_overrideRepId_idx" ON "SalesRepOverrideAssignment"("overrideRepId");

-- CreateIndex
CREATE INDEX "SalesRepOverrideAssignment_subordinateRepId_idx" ON "SalesRepOverrideAssignment"("subordinateRepId");

-- CreateIndex
CREATE INDEX "SalesRepOverrideAssignment_isActive_idx" ON "SalesRepOverrideAssignment"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRepOverrideAssignment_clinicId_overrideRepId_subordina_key" ON "SalesRepOverrideAssignment"("clinicId", "overrideRepId", "subordinateRepId");

-- CreateIndex
CREATE INDEX "SalesRepOverrideCommissionEvent_overrideRepId_status_idx" ON "SalesRepOverrideCommissionEvent"("overrideRepId", "status");

-- CreateIndex
CREATE INDEX "SalesRepOverrideCommissionEvent_clinicId_occurredAt_idx" ON "SalesRepOverrideCommissionEvent"("clinicId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesRepOverrideCommissionEvent_subordinateRepId_occurredAt_idx" ON "SalesRepOverrideCommissionEvent"("subordinateRepId", "occurredAt");

-- CreateIndex
CREATE INDEX "SalesRepOverrideCommissionEvent_sourceCommissionEventId_idx" ON "SalesRepOverrideCommissionEvent"("sourceCommissionEventId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRepOverrideCommissionEvent_clinicId_stripeEventId_over_key" ON "SalesRepOverrideCommissionEvent"("clinicId", "stripeEventId", "overrideRepId");

-- CreateIndex
CREATE INDEX "SalesRepDisposition_clinicId_idx" ON "SalesRepDisposition"("clinicId");

-- CreateIndex
CREATE INDEX "SalesRepDisposition_salesRepId_idx" ON "SalesRepDisposition"("salesRepId");

-- CreateIndex
CREATE INDEX "SalesRepDisposition_patientId_idx" ON "SalesRepDisposition"("patientId");

-- CreateIndex
CREATE INDEX "SalesRepDisposition_outcome_idx" ON "SalesRepDisposition"("outcome");

-- CreateIndex
CREATE INDEX "SalesRepDisposition_status_idx" ON "SalesRepDisposition"("status");

-- CreateIndex
CREATE INDEX "SalesRepDisposition_salesRepId_outcome_idx" ON "SalesRepDisposition"("salesRepId", "outcome");

-- CreateIndex
CREATE INDEX "SalesRepDisposition_clinicId_createdAt_idx" ON "SalesRepDisposition"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesRepDisposition_clinicId_status_idx" ON "SalesRepDisposition"("clinicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_patientId_idx" ON "Subscription"("patientId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "SubscriptionAction_subscriptionId_idx" ON "SubscriptionAction"("subscriptionId");

-- CreateIndex
CREATE INDEX "RetentionOffer_clinicId_isActive_idx" ON "RetentionOffer"("clinicId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");

-- CreateIndex
CREATE INDEX "Ticket_clinicId_status_priority_idx" ON "Ticket"("clinicId", "status", "priority");

-- CreateIndex
CREATE INDEX "Ticket_clinicId_status_createdAt_idx" ON "Ticket"("clinicId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Ticket_clinicId_assignedToId_status_idx" ON "Ticket"("clinicId", "assignedToId", "status");

-- CreateIndex
CREATE INDEX "Ticket_clinicId_teamId_status_idx" ON "Ticket"("clinicId", "teamId", "status");

-- CreateIndex
CREATE INDEX "Ticket_clinicId_category_status_idx" ON "Ticket"("clinicId", "category", "status");

-- CreateIndex
CREATE INDEX "Ticket_status_priority_createdAt_idx" ON "Ticket"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_assignedToId_status_idx" ON "Ticket"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Ticket_patientId_idx" ON "Ticket"("patientId");

-- CreateIndex
CREATE INDEX "Ticket_orderId_idx" ON "Ticket"("orderId");

-- CreateIndex
CREATE INDEX "Ticket_ticketNumber_idx" ON "Ticket"("ticketNumber");

-- CreateIndex
CREATE INDEX "Ticket_parentTicketId_idx" ON "Ticket"("parentTicketId");

-- CreateIndex
CREATE INDEX "Ticket_lastActivityAt_idx" ON "Ticket"("lastActivityAt" DESC);

-- CreateIndex
CREATE INDEX "Ticket_dueDate_idx" ON "Ticket"("dueDate");

-- CreateIndex
CREATE INDEX "TicketAssignment_ticketId_idx" ON "TicketAssignment"("ticketId");

-- CreateIndex
CREATE INDEX "TicketAssignment_assignedToId_idx" ON "TicketAssignment"("assignedToId");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_createdAt_idx" ON "TicketComment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketStatusHistory_ticketId_createdAt_idx" ON "TicketStatusHistory"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketWorkLog_ticketId_createdAt_idx" ON "TicketWorkLog"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketWorkLog_userId_createdAt_idx" ON "TicketWorkLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketEscalation_ticketId_isActive_idx" ON "TicketEscalation"("ticketId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSLA_ticketId_key" ON "TicketSLA"("ticketId");

-- CreateIndex
CREATE INDEX "TicketSLA_resolutionDue_breached_idx" ON "TicketSLA"("resolutionDue", "breached");

-- CreateIndex
CREATE INDEX "TicketSLA_slaPolicyId_idx" ON "TicketSLA"("slaPolicyId");

-- CreateIndex
CREATE INDEX "TicketTeam_clinicId_isActive_idx" ON "TicketTeam"("clinicId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTeam_clinicId_name_key" ON "TicketTeam"("clinicId", "name");

-- CreateIndex
CREATE INDEX "TicketTeamMember_userId_idx" ON "TicketTeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTeamMember_teamId_userId_key" ON "TicketTeamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "TicketWatcher_userId_idx" ON "TicketWatcher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketWatcher_ticketId_userId_key" ON "TicketWatcher"("ticketId", "userId");

-- CreateIndex
CREATE INDEX "TicketRelation_ticketId_idx" ON "TicketRelation"("ticketId");

-- CreateIndex
CREATE INDEX "TicketRelation_relationType_relatedId_idx" ON "TicketRelation"("relationType", "relatedId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketRelation_ticketId_relationType_relatedId_key" ON "TicketRelation"("ticketId", "relationType", "relatedId");

-- CreateIndex
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");

-- CreateIndex
CREATE INDEX "TicketAttachment_commentId_idx" ON "TicketAttachment"("commentId");

-- CreateIndex
CREATE INDEX "TicketActivity_ticketId_createdAt_idx" ON "TicketActivity"("ticketId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TicketActivity_ticketId_activityType_idx" ON "TicketActivity"("ticketId", "activityType");

-- CreateIndex
CREATE INDEX "TicketActivity_userId_createdAt_idx" ON "TicketActivity"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TicketMerge_sourceTicketId_key" ON "TicketMerge"("sourceTicketId");

-- CreateIndex
CREATE INDEX "TicketMerge_targetTicketId_idx" ON "TicketMerge"("targetTicketId");

-- CreateIndex
CREATE INDEX "SlaPolicyConfig_clinicId_isActive_idx" ON "SlaPolicyConfig"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "SlaPolicyConfig_clinicId_priority_idx" ON "SlaPolicyConfig"("clinicId", "priority");

-- CreateIndex
CREATE INDEX "SlaPolicyConfig_clinicId_category_idx" ON "SlaPolicyConfig"("clinicId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicyConfig_clinicId_name_key" ON "SlaPolicyConfig"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TicketBusinessHours_clinicId_name_key" ON "TicketBusinessHours"("clinicId", "name");

-- CreateIndex
CREATE INDEX "TicketMacro_clinicId_isActive_idx" ON "TicketMacro"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "TicketMacro_clinicId_category_idx" ON "TicketMacro"("clinicId", "category");

-- CreateIndex
CREATE INDEX "TicketMacro_createdById_idx" ON "TicketMacro"("createdById");

-- CreateIndex
CREATE INDEX "TicketMacro_teamId_idx" ON "TicketMacro"("teamId");

-- CreateIndex
CREATE INDEX "TicketTemplate_clinicId_category_idx" ON "TicketTemplate"("clinicId", "category");

-- CreateIndex
CREATE INDEX "TicketTemplate_clinicId_isActive_idx" ON "TicketTemplate"("clinicId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTemplate_clinicId_name_key" ON "TicketTemplate"("clinicId", "name");

-- CreateIndex
CREATE INDEX "TicketAutomationRule_clinicId_trigger_isActive_idx" ON "TicketAutomationRule"("clinicId", "trigger", "isActive");

-- CreateIndex
CREATE INDEX "TicketAutomationRule_clinicId_isActive_idx" ON "TicketAutomationRule"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "TicketSavedView_clinicId_isPersonal_idx" ON "TicketSavedView"("clinicId", "isPersonal");

-- CreateIndex
CREATE INDEX "TicketSavedView_createdById_idx" ON "TicketSavedView"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCsat_ticketId_key" ON "TicketCsat"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCsat_surveyToken_key" ON "TicketCsat"("surveyToken");

-- CreateIndex
CREATE INDEX "TicketCsat_ticketId_idx" ON "TicketCsat"("ticketId");

-- CreateIndex
CREATE INDEX "TicketCsat_surveyToken_idx" ON "TicketCsat"("surveyToken");

-- CreateIndex
CREATE INDEX "PatientWeightLog_patientId_recordedAt_idx" ON "PatientWeightLog"("patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "PatientMedicationReminder_patientId_isActive_idx" ON "PatientMedicationReminder"("patientId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PatientMedicationReminder_patientId_medicationName_dayOfWee_key" ON "PatientMedicationReminder"("patientId", "medicationName", "dayOfWeek");

-- CreateIndex
CREATE INDEX "PatientWaterLog_patientId_recordedAt_idx" ON "PatientWaterLog"("patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "PatientWaterLog_clinicId_idx" ON "PatientWaterLog"("clinicId");

-- CreateIndex
CREATE INDEX "PatientExerciseLog_patientId_recordedAt_idx" ON "PatientExerciseLog"("patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "PatientExerciseLog_clinicId_idx" ON "PatientExerciseLog"("clinicId");

-- CreateIndex
CREATE INDEX "PatientSleepLog_patientId_recordedAt_idx" ON "PatientSleepLog"("patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "PatientSleepLog_clinicId_idx" ON "PatientSleepLog"("clinicId");

-- CreateIndex
CREATE INDEX "PatientNutritionLog_patientId_recordedAt_idx" ON "PatientNutritionLog"("patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "PatientNutritionLog_clinicId_idx" ON "PatientNutritionLog"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientDeviceConnection_terraUserId_key" ON "PatientDeviceConnection"("terraUserId");

-- CreateIndex
CREATE INDEX "PatientDeviceConnection_patientId_idx" ON "PatientDeviceConnection"("patientId");

-- CreateIndex
CREATE INDEX "PatientDeviceConnection_terraUserId_idx" ON "PatientDeviceConnection"("terraUserId");

-- CreateIndex
CREATE INDEX "PatientDeviceConnection_clinicId_patientId_idx" ON "PatientDeviceConnection"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "PatientStreak_patientId_idx" ON "PatientStreak"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientStreak_patientId_streakType_key" ON "PatientStreak"("patientId", "streakType");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_code_key" ON "Achievement"("code");

-- CreateIndex
CREATE INDEX "PatientAchievement_patientId_idx" ON "PatientAchievement"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAchievement_patientId_achievementId_key" ON "PatientAchievement"("patientId", "achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPoints_patientId_key" ON "PatientPoints"("patientId");

-- CreateIndex
CREATE INDEX "PointsHistory_patientId_idx" ON "PointsHistory"("patientId");

-- CreateIndex
CREATE INDEX "PointsHistory_createdAt_idx" ON "PointsHistory"("createdAt");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_patientId_idx" ON "ChallengeParticipant"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeParticipant_challengeId_patientId_key" ON "ChallengeParticipant"("challengeId", "patientId");

-- AddForeignKey
ALTER TABLE "Influencer" ADD CONSTRAINT "Influencer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerBankAccount" ADD CONSTRAINT "InfluencerBankAccount_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralTracking" ADD CONSTRAINT "ReferralTracking_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralTracking" ADD CONSTRAINT "ReferralTracking_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralTracking" ADD CONSTRAINT "ReferralTracking_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "ReferralTracking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "CommissionPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateProgram" ADD CONSTRAINT "AffiliateProgram_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateTier" ADD CONSTRAINT "AffiliateTier_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AffiliateProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_referredPatientId_fkey" FOREIGN KEY ("referredPatientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_currentTierId_fkey" FOREIGN KEY ("currentTierId") REFERENCES "AffiliateCommissionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateOtpCode" ADD CONSTRAINT "AffiliateOtpCode_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplication" ADD CONSTRAINT "AffiliateApplication_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplication" ADD CONSTRAINT "AffiliateApplication_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateRefCode" ADD CONSTRAINT "AffiliateRefCode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateRefCode" ADD CONSTRAINT "AffiliateRefCode_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommissionPlan" ADD CONSTRAINT "AffiliateCommissionPlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePlanAssignment" ADD CONSTRAINT "AffiliatePlanAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePlanAssignment" ADD CONSTRAINT "AffiliatePlanAssignment_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePlanAssignment" ADD CONSTRAINT "AffiliatePlanAssignment_commissionPlanId_fkey" FOREIGN KEY ("commissionPlanId") REFERENCES "AffiliateCommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommissionEvent" ADD CONSTRAINT "AffiliateCommissionEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommissionEvent" ADD CONSTRAINT "AffiliateCommissionEvent_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommissionEvent" ADD CONSTRAINT "AffiliateCommissionEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCompetition" ADD CONSTRAINT "AffiliateCompetition_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCompetitionEntry" ADD CONSTRAINT "AffiliateCompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "AffiliateCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCompetitionEntry" ADD CONSTRAINT "AffiliateCompetitionEntry_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateTouch" ADD CONSTRAINT "AffiliateTouch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateTouch" ADD CONSTRAINT "AffiliateTouch_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateAttributionConfig" ADD CONSTRAINT "AffiliateAttributionConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommissionTier" ADD CONSTRAINT "AffiliateCommissionTier_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AffiliateCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateProductRate" ADD CONSTRAINT "AffiliateProductRate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AffiliateCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePromotion" ADD CONSTRAINT "AffiliatePromotion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AffiliateCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePayoutMethod" ADD CONSTRAINT "AffiliatePayoutMethod_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateTaxDocument" ADD CONSTRAINT "AffiliateTaxDocument_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateFraudAlert" ADD CONSTRAINT "AffiliateFraudAlert_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateFraudAlert" ADD CONSTRAINT "AffiliateFraudAlert_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateFraudConfig" ADD CONSTRAINT "AffiliateFraudConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentType" ADD CONSTRAINT "AppointmentType_intakeFormTemplateId_fkey" FOREIGN KEY ("intakeFormTemplateId") REFERENCES "IntakeFormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Superbill" ADD CONSTRAINT "Superbill_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Superbill" ADD CONSTRAINT "Superbill_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Superbill" ADD CONSTRAINT "Superbill_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Superbill" ADD CONSTRAINT "Superbill_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuperbillItem" ADD CONSTRAINT "SuperbillItem_superbillId_fkey" FOREIGN KEY ("superbillId") REFERENCES "Superbill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCode" ADD CONSTRAINT "BillingCode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelehealthParticipant" ADD CONSTRAINT "TelehealthParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TelehealthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAudit" ADD CONSTRAINT "ProviderAudit_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAudit" ADD CONSTRAINT "PatientAudit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinic" ADD CONSTRAINT "UserClinic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinic" ADD CONSTRAINT "UserClinic_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditLog" ADD CONSTRAINT "UserAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicInviteCode" ADD CONSTRAINT "ClinicInviteCode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalInvite" ADD CONSTRAINT "PatientPortalInvite_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPortalInvite" ADD CONSTRAINT "PatientPortalInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Influencer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBundle" ADD CONSTRAINT "ProductBundle_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBundleItem" ADD CONSTRAINT "ProductBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "ProductBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBundleItem" ADD CONSTRAINT "ProductBundleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPayment" ADD CONSTRAINT "ScheduledPayment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPayment" ADD CONSTRAINT "ScheduledPayment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAuditLog" ADD CONSTRAINT "ClinicAuditLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicAuditLog" ADD CONSTRAINT "ClinicAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PatientDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReportResult" ADD CONSTRAINT "LabReportResult_labReportId_fkey" FOREIGN KEY ("labReportId") REFERENCES "LabReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOAPNote" ADD CONSTRAINT "SOAPNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOAPNote" ADD CONSTRAINT "SOAPNote_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOAPNote" ADD CONSTRAINT "SOAPNote_intakeDocumentId_fkey" FOREIGN KEY ("intakeDocumentId") REFERENCES "PatientDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOAPNote" ADD CONSTRAINT "SOAPNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOAPNoteRevision" ADD CONSTRAINT "SOAPNoteRevision_soapNoteId_fkey" FOREIGN KEY ("soapNoteId") REFERENCES "SOAPNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CarePlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanTemplate" ADD CONSTRAINT "CarePlanTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanTemplate" ADD CONSTRAINT "CarePlanTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanGoal" ADD CONSTRAINT "CarePlanGoal_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanActivity" ADD CONSTRAINT "CarePlanActivity_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanActivity" ADD CONSTRAINT "CarePlanActivity_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CarePlanGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanProgress" ADD CONSTRAINT "CarePlanProgress_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanProgress" ADD CONSTRAINT "CarePlanProgress_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CarePlanGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanProgress" ADD CONSTRAINT "CarePlanProgress_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "CarePlanActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanProgress" ADD CONSTRAINT "CarePlanProgress_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApproval" ADD CONSTRAINT "PolicyApproval_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyApproval" ADD CONSTRAINT "PolicyApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgment" ADD CONSTRAINT "PolicyAcknowledgment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgment" ADD CONSTRAINT "PolicyAcknowledgment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgment" ADD CONSTRAINT "PolicyAcknowledgment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientShippingUpdate" ADD CONSTRAINT "PatientShippingUpdate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientShippingUpdate" ADD CONSTRAINT "PatientShippingUpdate_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientShippingUpdate" ADD CONSTRAINT "PatientShippingUpdate_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePhoto" ADD CONSTRAINT "PackagePhoto_assignedClinicId_fkey" FOREIGN KEY ("assignedClinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_lastOrderId_fkey" FOREIGN KEY ("lastOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_parentRefillId_fkey" FOREIGN KEY ("parentRefillId") REFERENCES "RefillQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillQueue" ADD CONSTRAINT "RefillQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormTemplate" ADD CONSTRAINT "IntakeFormTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormTemplate" ADD CONSTRAINT "IntakeFormTemplate_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormTemplate" ADD CONSTRAINT "IntakeFormTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormQuestion" ADD CONSTRAINT "IntakeFormQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IntakeFormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormSubmission" ADD CONSTRAINT "IntakeFormSubmission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IntakeFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormSubmission" ADD CONSTRAINT "IntakeFormSubmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormSubmission" ADD CONSTRAINT "IntakeFormSubmission_formLinkId_fkey" FOREIGN KEY ("formLinkId") REFERENCES "IntakeFormLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormResponse" ADD CONSTRAINT "IntakeFormResponse_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "IntakeFormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormResponse" ADD CONSTRAINT "IntakeFormResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "IntakeFormQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormLink" ADD CONSTRAINT "IntakeFormLink_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IntakeFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormLink" ADD CONSTRAINT "IntakeFormLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormLink" ADD CONSTRAINT "IntakeFormLink_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormLink" ADD CONSTRAINT "IntakeFormLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormDraft" ADD CONSTRAINT "IntakeFormDraft_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormDraft" ADD CONSTRAINT "IntakeFormDraft_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IntakeFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormDraft" ADD CONSTRAINT "IntakeFormDraft_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsageLog" ADD CONSTRAINT "ApiUsageLog_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationLog" ADD CONSTRAINT "IntegrationLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "InternalMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "InternalMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsOptOut" ADD CONSTRAINT "SmsOptOut_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsOptOut" ADD CONSTRAINT "SmsOptOut_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsQuietHours" ADD CONSTRAINT "SmsQuietHours_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsRateLimit" ADD CONSTRAINT "SmsRateLimit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientChatMessage" ADD CONSTRAINT "PatientChatMessage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientChatMessage" ADD CONSTRAINT "PatientChatMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientChatMessage" ADD CONSTRAINT "PatientChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "PatientChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_attributionAffiliateId_fkey" FOREIGN KEY ("attributionAffiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCounter" ADD CONSTRAINT "PatientCounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSalesRepAssignment" ADD CONSTRAINT "PatientSalesRepAssignment_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPhoto" ADD CONSTRAINT "PatientPhoto_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPhoto" ADD CONSTRAINT "PatientPhoto_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoiceUpload" ADD CONSTRAINT "PharmacyInvoiceUpload_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoiceLineItem" ADD CONSTRAINT "PharmacyInvoiceLineItem_invoiceUploadId_fkey" FOREIGN KEY ("invoiceUploadId") REFERENCES "PharmacyInvoiceUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyConsolidatedStatement" ADD CONSTRAINT "PharmacyConsolidatedStatement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPlatformFeeConfig" ADD CONSTRAINT "ClinicPlatformFeeConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEvent" ADD CONSTRAINT "PlatformFeeEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEvent" ADD CONSTRAINT "PlatformFeeEvent_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ClinicPlatformFeeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEvent" ADD CONSTRAINT "PlatformFeeEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEvent" ADD CONSTRAINT "PlatformFeeEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEvent" ADD CONSTRAINT "PlatformFeeEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeeEvent" ADD CONSTRAINT "PlatformFeeEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ClinicPlatformInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPlatformInvoice" ADD CONSTRAINT "ClinicPlatformInvoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPlatformInvoice" ADD CONSTRAINT "ClinicPlatformInvoice_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ClinicPlatformFeeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicCreditNote" ADD CONSTRAINT "ClinicCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ClinicPlatformInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rx" ADD CONSTRAINT "Rx_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RxOrderSet" ADD CONSTRAINT "RxOrderSet_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RxOrderSetItem" ADD CONSTRAINT "RxOrderSetItem_orderSetId_fkey" FOREIGN KEY ("orderSetId") REFERENCES "RxOrderSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescriptionCycle" ADD CONSTRAINT "PatientPrescriptionCycle_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescriptionCycle" ADD CONSTRAINT "PatientPrescriptionCycle_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderLicense" ADD CONSTRAINT "ProviderLicense_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderClinic" ADD CONSTRAINT "ProviderClinic_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderClinic" ADD CONSTRAINT "ProviderClinic_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAvailability" ADD CONSTRAINT "ProviderAvailability_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAvailability" ADD CONSTRAINT "ProviderAvailability_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTimeOff" ADD CONSTRAINT "ProviderTimeOff_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTimeOff" ADD CONSTRAINT "ProviderTimeOff_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDateOverride" ADD CONSTRAINT "ProviderDateOverride_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDateOverride" ADD CONSTRAINT "ProviderDateOverride_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderRoutingConfig" ADD CONSTRAINT "ProviderRoutingConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCompensationPlan" ADD CONSTRAINT "ProviderCompensationPlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCompensationPlan" ADD CONSTRAINT "ProviderCompensationPlan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCompensationEvent" ADD CONSTRAINT "ProviderCompensationEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCompensationEvent" ADD CONSTRAINT "ProviderCompensationEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCompensationEvent" ADD CONSTRAINT "ProviderCompensationEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCompensationEvent" ADD CONSTRAINT "ProviderCompensationEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProviderCompensationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueRecognitionEntry" ADD CONSTRAINT "RevenueRecognitionEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueRecognitionJournal" ADD CONSTRAINT "RevenueRecognitionJournal_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "RevenueRecognitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepRefCode" ADD CONSTRAINT "SalesRepRefCode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepRefCode" ADD CONSTRAINT "SalesRepRefCode_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepTouch" ADD CONSTRAINT "SalesRepTouch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepTouch" ADD CONSTRAINT "SalesRepTouch_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepCommissionPlan" ADD CONSTRAINT "SalesRepCommissionPlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepPlanAssignment" ADD CONSTRAINT "SalesRepPlanAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepPlanAssignment" ADD CONSTRAINT "SalesRepPlanAssignment_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepPlanAssignment" ADD CONSTRAINT "SalesRepPlanAssignment_commissionPlanId_fkey" FOREIGN KEY ("commissionPlanId") REFERENCES "SalesRepCommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepProductCommission" ADD CONSTRAINT "SalesRepProductCommission_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SalesRepCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepProductCommission" ADD CONSTRAINT "SalesRepProductCommission_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepProductCommission" ADD CONSTRAINT "SalesRepProductCommission_productBundleId_fkey" FOREIGN KEY ("productBundleId") REFERENCES "ProductBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepCommissionEvent" ADD CONSTRAINT "SalesRepCommissionEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepCommissionEvent" ADD CONSTRAINT "SalesRepCommissionEvent_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepVolumeCommissionTier" ADD CONSTRAINT "SalesRepVolumeCommissionTier_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SalesRepCommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepOverrideAssignment" ADD CONSTRAINT "SalesRepOverrideAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepOverrideAssignment" ADD CONSTRAINT "SalesRepOverrideAssignment_overrideRepId_fkey" FOREIGN KEY ("overrideRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepOverrideAssignment" ADD CONSTRAINT "SalesRepOverrideAssignment_subordinateRepId_fkey" FOREIGN KEY ("subordinateRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepOverrideCommissionEvent" ADD CONSTRAINT "SalesRepOverrideCommissionEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepOverrideCommissionEvent" ADD CONSTRAINT "SalesRepOverrideCommissionEvent_overrideRepId_fkey" FOREIGN KEY ("overrideRepId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepOverrideCommissionEvent" ADD CONSTRAINT "SalesRepOverrideCommissionEvent_overrideAssignmentId_fkey" FOREIGN KEY ("overrideAssignmentId") REFERENCES "SalesRepOverrideAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepDisposition" ADD CONSTRAINT "SalesRepDisposition_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepDisposition" ADD CONSTRAINT "SalesRepDisposition_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepDisposition" ADD CONSTRAINT "SalesRepDisposition_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRepDisposition" ADD CONSTRAINT "SalesRepDisposition_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAction" ADD CONSTRAINT "SubscriptionAction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionOffer" ADD CONSTRAINT "RetentionOffer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TicketTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_lastWorkedById_fkey" FOREIGN KEY ("lastWorkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_lastReopenedById_fkey" FOREIGN KEY ("lastReopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_parentTicketId_fkey" FOREIGN KEY ("parentTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAssignment" ADD CONSTRAINT "TicketAssignment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAssignment" ADD CONSTRAINT "TicketAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAssignment" ADD CONSTRAINT "TicketAssignment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusHistory" ADD CONSTRAINT "TicketStatusHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusHistory" ADD CONSTRAINT "TicketStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWorkLog" ADD CONSTRAINT "TicketWorkLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWorkLog" ADD CONSTRAINT "TicketWorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEscalation" ADD CONSTRAINT "TicketEscalation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEscalation" ADD CONSTRAINT "TicketEscalation_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEscalation" ADD CONSTRAINT "TicketEscalation_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSLA" ADD CONSTRAINT "TicketSLA_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSLA" ADD CONSTRAINT "TicketSLA_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicyConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTeam" ADD CONSTRAINT "TicketTeam_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTeam" ADD CONSTRAINT "TicketTeam_defaultSlaPolicyId_fkey" FOREIGN KEY ("defaultSlaPolicyId") REFERENCES "SlaPolicyConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTeamMember" ADD CONSTRAINT "TicketTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TicketTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTeamMember" ADD CONSTRAINT "TicketTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWatcher" ADD CONSTRAINT "TicketWatcher_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWatcher" ADD CONSTRAINT "TicketWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWatcher" ADD CONSTRAINT "TicketWatcher_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRelation" ADD CONSTRAINT "TicketRelation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRelation" ADD CONSTRAINT "TicketRelation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "TicketAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMerge" ADD CONSTRAINT "TicketMerge_sourceTicketId_fkey" FOREIGN KEY ("sourceTicketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMerge" ADD CONSTRAINT "TicketMerge_targetTicketId_fkey" FOREIGN KEY ("targetTicketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMerge" ADD CONSTRAINT "TicketMerge_mergedById_fkey" FOREIGN KEY ("mergedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicyConfig" ADD CONSTRAINT "SlaPolicyConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicyConfig" ADD CONSTRAINT "SlaPolicyConfig_businessHoursId_fkey" FOREIGN KEY ("businessHoursId") REFERENCES "TicketBusinessHours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketBusinessHours" ADD CONSTRAINT "TicketBusinessHours_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMacro" ADD CONSTRAINT "TicketMacro_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMacro" ADD CONSTRAINT "TicketMacro_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TicketTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMacro" ADD CONSTRAINT "TicketMacro_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTemplate" ADD CONSTRAINT "TicketTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTemplate" ADD CONSTRAINT "TicketTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAutomationRule" ADD CONSTRAINT "TicketAutomationRule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAutomationRule" ADD CONSTRAINT "TicketAutomationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSavedView" ADD CONSTRAINT "TicketSavedView_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSavedView" ADD CONSTRAINT "TicketSavedView_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCsat" ADD CONSTRAINT "TicketCsat_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientWeightLog" ADD CONSTRAINT "PatientWeightLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedicationReminder" ADD CONSTRAINT "PatientMedicationReminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientWaterLog" ADD CONSTRAINT "PatientWaterLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientWaterLog" ADD CONSTRAINT "PatientWaterLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientExerciseLog" ADD CONSTRAINT "PatientExerciseLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientExerciseLog" ADD CONSTRAINT "PatientExerciseLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSleepLog" ADD CONSTRAINT "PatientSleepLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSleepLog" ADD CONSTRAINT "PatientSleepLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNutritionLog" ADD CONSTRAINT "PatientNutritionLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientNutritionLog" ADD CONSTRAINT "PatientNutritionLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDeviceConnection" ADD CONSTRAINT "PatientDeviceConnection_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDeviceConnection" ADD CONSTRAINT "PatientDeviceConnection_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientStreak" ADD CONSTRAINT "PatientStreak_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAchievement" ADD CONSTRAINT "PatientAchievement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAchievement" ADD CONSTRAINT "PatientAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPoints" ADD CONSTRAINT "PatientPoints_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsHistory" ADD CONSTRAINT "PointsHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

