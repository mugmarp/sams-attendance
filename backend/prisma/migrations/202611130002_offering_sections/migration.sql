ALTER TABLE "Course" ADD COLUMN "offeringKey" TEXT NOT NULL DEFAULT 'MAIN';
DROP INDEX "Course_code_academicYear_semester_key";
CREATE UNIQUE INDEX "Course_code_academicYear_semester_offeringKey_key" ON "Course"("code", "academicYear", "semester", "offeringKey");
ALTER TABLE "CoursePlan" ADD COLUMN "reviewNote" TEXT NOT NULL DEFAULT '';
