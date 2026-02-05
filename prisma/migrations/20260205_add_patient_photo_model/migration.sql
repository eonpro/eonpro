-- CreateEnum
CREATE TYPE "PatientPhotoType" AS ENUM (
    'PROGRESS_FRONT',
    'PROGRESS_SIDE',
    'PROGRESS_BACK',
    'ID_FRONT',
    'ID_BACK',
    'SELFIE',
    'MEDICAL_SKIN',
    'MEDICAL_INJURY',
    'MEDICAL_SYMPTOM',
    'MEDICAL_BEFORE',
    'MEDICAL_AFTER',
    'MEDICAL_OTHER',
    'PROFILE_AVATAR'
);

-- CreateEnum
CREATE TYPE "PatientPhotoVerificationStatus" AS ENUM (
    'NOT_APPLICABLE',
    'PENDING',
    'IN_REVIEW',
    'VERIFIED',
    'REJECTED',
    'EXPIRED'
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

-- AddForeignKey
ALTER TABLE "PatientPhoto" ADD CONSTRAINT "PatientPhoto_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPhoto" ADD CONSTRAINT "PatientPhoto_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
