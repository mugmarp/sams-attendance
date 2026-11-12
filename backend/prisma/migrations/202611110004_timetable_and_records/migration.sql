-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "countExcused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "countLate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "policyVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "effectiveFrom" DATE,
ADD COLUMN     "effectiveUntil" DATE;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "timetableDate" DATE,
ADD COLUMN     "timetableEntryId" TEXT;

-- CreateTable
CREATE TABLE "AcademicTerm" (
    "id" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "excludedDates" JSONB NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceNote" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetablePublication" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRevision" TEXT,
    "contentHash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimetablePublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "room" TEXT,
    "sessionType" "SessionType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableReview" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "baselineHash" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "TimetableReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicTerm_academicYear_semester_key" ON "AcademicTerm"("academicYear", "semester");

-- CreateIndex
CREATE INDEX "TimetablePublication_source_checkedAt_idx" ON "TimetablePublication"("source", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TimetablePublication_source_contentHash_key" ON "TimetablePublication"("source", "contentHash");

-- CreateIndex
CREATE INDEX "TimetableEntry_courseId_termId_idx" ON "TimetableEntry"("courseId", "termId");

-- CreateIndex
CREATE INDEX "ReportSnapshot_courseId_createdAt_idx" ON "ReportSnapshot"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_recordedAt_idx" ON "AuditEvent"("entityType", "entityId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_timetableEntryId_timetableDate_key" ON "Session"("timetableEntryId", "timetableDate");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_timetableEntryId_fkey" FOREIGN KEY ("timetableEntryId") REFERENCES "TimetableEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "TimetablePublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableReview" ADD CONSTRAINT "TimetableReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

