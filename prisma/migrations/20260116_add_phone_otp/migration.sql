-- CreateTable for PhoneOtp (SMS-based authentication)
CREATE TABLE IF NOT EXISTS "PhoneOtp" (
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

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PhoneOtp_phone_code_expiresAt_idx" ON "PhoneOtp"("phone", "code", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PhoneOtp_phone_idx" ON "PhoneOtp"("phone");
