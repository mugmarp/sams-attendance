-- Bounded programme/year/group filtering on registrar and cohort views.
CREATE INDEX "User_programmeCode_year_idx" ON "User"("programmeCode", "year");
CREATE INDEX "User_studyGroupKey_idx" ON "User"("studyGroupKey");
CREATE INDEX "Course_programmeCode_year_semester_academicYear_idx" ON "Course"("programmeCode", "year", "semester", "academicYear");
