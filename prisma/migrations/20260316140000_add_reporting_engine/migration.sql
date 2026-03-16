-- Enterprise Reporting Engine: saved report templates and scheduled delivery.

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
    "accessRoles" TEXT[] DEFAULT ARRAY['super_admin','admin']::TEXT[],
    "lastRunAt" TIMESTAMP(3),

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

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

CREATE INDEX "ReportTemplate_clinicId_idx" ON "ReportTemplate"("clinicId");
CREATE INDEX "ReportTemplate_createdById_idx" ON "ReportTemplate"("createdById");
CREATE INDEX "ReportTemplate_dataSource_idx" ON "ReportTemplate"("dataSource");
CREATE INDEX "ReportTemplate_isSystemTemplate_idx" ON "ReportTemplate"("isSystemTemplate");

CREATE INDEX "ReportSchedule_isActive_nextRunAt_idx" ON "ReportSchedule"("isActive", "nextRunAt");
CREATE INDEX "ReportSchedule_templateId_idx" ON "ReportSchedule"("templateId");
CREATE INDEX "ReportSchedule_clinicId_idx" ON "ReportSchedule"("clinicId");

ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
