-- CreateTable
CREATE TABLE "TicketWorkLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "duration" INTEGER,
    "description" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    CONSTRAINT "TicketWorkLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketWorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketEscalation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "escalatedById" INTEGER NOT NULL,
    "escalatedToId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resolvedAt" DATETIME,
    CONSTRAINT "TicketEscalation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketEscalation_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketEscalation_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketSLA" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "firstResponseDue" DATETIME,
    "firstResponseAt" DATETIME,
    "resolutionDue" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "breached" BOOLEAN NOT NULL DEFAULT false,
    "breachReason" TEXT,
    CONSTRAINT "TicketSLA_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ticketNumber" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "disposition" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "patientId" INTEGER,
    "orderId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "currentOwnerId" INTEGER,
    "lastWorkedById" INTEGER,
    "lastWorkedAt" DATETIME,
    "resolvedAt" DATETIME,
    "resolvedById" INTEGER,
    "resolutionNotes" TEXT,
    "resolutionTime" INTEGER,
    "actualWorkTime" INTEGER,
    "tags" JSONB,
    "customFields" JSONB,
    "attachments" JSONB,
    CONSTRAINT "Ticket_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_lastWorkedById_fkey" FOREIGN KEY ("lastWorkedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("assignedToId", "attachments", "category", "createdAt", "createdById", "customFields", "description", "disposition", "id", "orderId", "patientId", "priority", "resolutionNotes", "resolvedAt", "resolvedById", "status", "tags", "ticketNumber", "title", "updatedAt") SELECT "assignedToId", "attachments", "category", "createdAt", "createdById", "customFields", "description", "disposition", "id", "orderId", "patientId", "priority", "resolutionNotes", "resolvedAt", "resolvedById", "status", "tags", "ticketNumber", "title", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE INDEX "Ticket_status_priority_createdAt_idx" ON "Ticket"("status", "priority", "createdAt");
CREATE INDEX "Ticket_assignedToId_status_idx" ON "Ticket"("assignedToId", "status");
CREATE INDEX "Ticket_patientId_idx" ON "Ticket"("patientId");
CREATE INDEX "Ticket_ticketNumber_idx" ON "Ticket"("ticketNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
