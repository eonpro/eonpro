-- CreateEnum (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationCategory') THEN
        CREATE TYPE "NotificationCategory" AS ENUM ('PRESCRIPTION', 'PATIENT', 'ORDER', 'SYSTEM', 'APPOINTMENT', 'MESSAGE', 'PAYMENT', 'REFILL');
    END IF;
END
$$;

-- CreateEnum (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationPriority') THEN
        CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
    END IF;
END
$$;

-- CreateTable (if not exists)
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "clinicId" INTEGER,
    "category" "NotificationCategory" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" VARCHAR(500),
    "metadata" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "sourceType" VARCHAR(50),
    "sourceId" VARCHAR(255),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "Notification_userId_isArchived_idx" ON "Notification"("userId", "isArchived");

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "Notification_clinicId_category_idx" ON "Notification"("clinicId", "category");

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "Notification_sourceType_sourceId_idx" ON "Notification"("sourceType", "sourceId");

-- AddForeignKey (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Notification_userId_fkey') THEN
        ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- AddForeignKey (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Notification_clinicId_fkey') THEN
        ALTER TABLE "Notification" ADD CONSTRAINT "Notification_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;
