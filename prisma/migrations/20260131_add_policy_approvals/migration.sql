-- Policy Approval System for SOC 2 Compliance
-- Digital signatures for policy acknowledgments

-- Policy definitions table
CREATE TABLE "Policy" (
    "id" SERIAL PRIMARY KEY,
    "policyId" VARCHAR(20) NOT NULL UNIQUE,  -- e.g., "POL-001"
    "title" VARCHAR(255) NOT NULL,
    "version" VARCHAR(20) NOT NULL,          -- e.g., "1.0"
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,                  -- Full policy markdown
    "contentHash" VARCHAR(64) NOT NULL,       -- SHA-256 hash of content
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, active, superseded
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "approvalRoles" TEXT[] NOT NULL DEFAULT ARRAY['super_admin']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Policy approvals (executive signatures)
CREATE TABLE "PolicyApproval" (
    "id" SERIAL PRIMARY KEY,
    "policyId" INTEGER NOT NULL REFERENCES "Policy"("id"),
    "userId" INTEGER NOT NULL REFERENCES "User"("id"),
    "userEmail" VARCHAR(255) NOT NULL,
    "userName" VARCHAR(255) NOT NULL,
    "userRole" VARCHAR(50) NOT NULL,
    "approvalType" VARCHAR(50) NOT NULL,      -- 'executive_approval', 'ciso_approval', 'acknowledgment'
    "ipAddress" VARCHAR(45) NOT NULL,
    "userAgent" TEXT,
    "contentHashAtApproval" VARCHAR(64) NOT NULL,  -- Hash when approved (tamper detection)
    "signatureStatement" TEXT NOT NULL,        -- Legal statement they agreed to
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE("policyId", "userId", "approvalType")
);

-- Employee policy acknowledgments
CREATE TABLE "PolicyAcknowledgment" (
    "id" SERIAL PRIMARY KEY,
    "policyId" INTEGER NOT NULL REFERENCES "Policy"("id"),
    "userId" INTEGER NOT NULL REFERENCES "User"("id"),
    "userEmail" VARCHAR(255) NOT NULL,
    "userName" VARCHAR(255) NOT NULL,
    "userRole" VARCHAR(50) NOT NULL,
    "clinicId" INTEGER REFERENCES "Clinic"("id"),
    "ipAddress" VARCHAR(45) NOT NULL,
    "userAgent" TEXT,
    "contentHashAtAcknowledgment" VARCHAR(64) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE("policyId", "userId")
);

-- Indexes for efficient querying
CREATE INDEX "idx_policy_status" ON "Policy"("status");
CREATE INDEX "idx_policy_approval_policy" ON "PolicyApproval"("policyId");
CREATE INDEX "idx_policy_approval_user" ON "PolicyApproval"("userId");
CREATE INDEX "idx_policy_ack_policy" ON "PolicyAcknowledgment"("policyId");
CREATE INDEX "idx_policy_ack_user" ON "PolicyAcknowledgment"("userId");
CREATE INDEX "idx_policy_ack_clinic" ON "PolicyAcknowledgment"("clinicId");

-- Add audit trigger for compliance
CREATE OR REPLACE FUNCTION audit_policy_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Log to HIPAA audit (will be handled in application layer)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER policy_approval_audit
    AFTER INSERT ON "PolicyApproval"
    FOR EACH ROW
    EXECUTE FUNCTION audit_policy_approval();
