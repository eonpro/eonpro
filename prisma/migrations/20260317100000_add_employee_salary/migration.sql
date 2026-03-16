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

-- CreateIndex
CREATE INDEX "EmployeeSalary_clinicId_idx" ON "EmployeeSalary"("clinicId");

-- CreateIndex
CREATE INDEX "EmployeeSalary_userId_idx" ON "EmployeeSalary"("userId");

-- CreateIndex
CREATE INDEX "EmployeeSalary_isActive_idx" ON "EmployeeSalary"("isActive");

-- CreateIndex
CREATE INDEX "EmployeeSalary_effectiveFrom_effectiveTo_idx" ON "EmployeeSalary"("effectiveFrom", "effectiveTo");

-- CreateIndex (only one active salary per user per clinic)
CREATE UNIQUE INDEX "EmployeeSalary_clinicId_userId_isActive_key" ON "EmployeeSalary"("clinicId", "userId", "isActive");

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
