-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_courseId_termId_sourceKey_key" ON "TimetableEntry"("courseId", "termId", "sourceKey");

