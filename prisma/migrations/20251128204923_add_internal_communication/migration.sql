-- CreateTable
CREATE TABLE "InternalMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" INTEGER NOT NULL,
    "recipientId" INTEGER,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "attachments" JSONB,
    "messageType" TEXT NOT NULL DEFAULT 'DIRECT',
    "channelId" TEXT,
    "parentMessageId" INTEGER,
    "metadata" JSONB,
    CONSTRAINT "InternalMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InternalMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InternalMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "InternalMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ticket" (
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
    "resolvedAt" DATETIME,
    "resolvedById" INTEGER,
    "resolutionNotes" TEXT,
    "tags" JSONB,
    "customFields" JSONB,
    "attachments" JSONB,
    CONSTRAINT "Ticket_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "assignedById" INTEGER NOT NULL,
    "assignedToId" INTEGER NOT NULL,
    "notes" TEXT,
    CONSTRAINT "TicketAssignment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketAssignment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketStatusHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "changedById" INTEGER NOT NULL,
    "reason" TEXT,
    CONSTRAINT "TicketStatusHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InternalMessage_senderId_createdAt_idx" ON "InternalMessage"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "InternalMessage_recipientId_isRead_idx" ON "InternalMessage"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "InternalMessage_channelId_createdAt_idx" ON "InternalMessage"("channelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");

-- CreateIndex
CREATE INDEX "Ticket_status_priority_createdAt_idx" ON "Ticket"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_assignedToId_status_idx" ON "Ticket"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Ticket_patientId_idx" ON "Ticket"("patientId");

-- CreateIndex
CREATE INDEX "Ticket_ticketNumber_idx" ON "Ticket"("ticketNumber");

-- CreateIndex
CREATE INDEX "TicketAssignment_ticketId_idx" ON "TicketAssignment"("ticketId");

-- CreateIndex
CREATE INDEX "TicketAssignment_assignedToId_idx" ON "TicketAssignment"("assignedToId");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_createdAt_idx" ON "TicketComment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketStatusHistory_ticketId_createdAt_idx" ON "TicketStatusHistory"("ticketId", "createdAt");
