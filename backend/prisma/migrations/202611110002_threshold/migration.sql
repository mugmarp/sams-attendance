ALTER TABLE "Course" ADD COLUMN "attendanceThreshold" INTEGER NOT NULL DEFAULT 80;
ALTER TABLE "Course" ADD CONSTRAINT "Course_attendanceThreshold_check" CHECK ("attendanceThreshold" BETWEEN 1 AND 100);
