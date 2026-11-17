CREATE TABLE "Room" (
 "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
 "campus" TEXT, "building" TEXT, "roomType" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
 "capacity" INTEGER, "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "reviewStatus" TEXT NOT NULL DEFAULT 'REFERENCE', "isActive" BOOLEAN NOT NULL DEFAULT false,
 "sourceNote" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Room_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0)
);
ALTER TABLE "Session" ADD COLUMN "roomId" TEXT REFERENCES "Room"("id") ON DELETE SET NULL;
ALTER TABLE "TimetableEntry" ADD COLUMN "roomId" TEXT REFERENCES "Room"("id") ON DELETE SET NULL;
CREATE INDEX "Session_roomId_startTime_endTime_idx" ON "Session"("roomId", "startTime", "endTime");
CREATE TABLE "MockHistoryBatch" (
 "id" TEXT NOT NULL PRIMARY KEY, "batchKey" TEXT NOT NULL UNIQUE,
 "manifestHash" TEXT NOT NULL, "actorId" TEXT NOT NULL REFERENCES "User"("id"),
 "summary" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
