-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "AttendanceChange" ADD COLUMN     "operationId" UUID;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "OfflinePreparation" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflinePreparation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncReceipt" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceClaim" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewerId" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflinePreparation_actorId_sessionId_idx" ON "OfflinePreparation"("actorId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncReceipt_actorId_operationId_key" ON "SyncReceipt"("actorId", "operationId");

-- CreateIndex
CREATE INDEX "AttendanceClaim_sessionId_status_idx" ON "AttendanceClaim"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceClaim_studentId_sessionId_key" ON "AttendanceClaim"("studentId", "sessionId");

-- AddForeignKey
ALTER TABLE "OfflinePreparation" ADD CONSTRAINT "OfflinePreparation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflinePreparation" ADD CONSTRAINT "OfflinePreparation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncReceipt" ADD CONSTRAINT "SyncReceipt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceClaim" ADD CONSTRAINT "AttendanceClaim_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceClaim" ADD CONSTRAINT "AttendanceClaim_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceClaim" ADD CONSTRAINT "AttendanceClaim_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

