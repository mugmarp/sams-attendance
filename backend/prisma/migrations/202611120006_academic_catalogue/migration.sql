-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "programmeCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "admissionYear" INTEGER,
ADD COLUMN     "dataOrigin" TEXT NOT NULL DEFAULT 'OPERATOR',
ADD COLUMN     "programmeCode" TEXT,
ADD COLUMN     "sponsorshipCode" TEXT,
ADD COLUMN     "studyAcademicYear" TEXT,
ADD COLUMN     "studyGroupKey" TEXT,
ADD COLUMN     "studySemester" INTEGER;

-- CreateTable
CREATE TABLE "Faculty" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Programme" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facultyCode" TEXT NOT NULL,
    "durationYears" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ProgrammeGroup" (
    "key" TEXT NOT NULL,
    "programmeCode" TEXT NOT NULL,
    "studyYear" INTEGER NOT NULL,
    "track" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ProgrammeGroup_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CourseAudience" (
    "courseId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,

    CONSTRAINT "CourseAudience_pkey" PRIMARY KEY ("courseId","groupKey")
);

-- CreateIndex
CREATE INDEX "Programme_facultyCode_idx" ON "Programme"("facultyCode");

-- CreateIndex
CREATE INDEX "ProgrammeGroup_programmeCode_studyYear_idx" ON "ProgrammeGroup"("programmeCode", "studyYear");

-- CreateIndex
CREATE INDEX "CourseAudience_groupKey_idx" ON "CourseAudience"("groupKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_programmeCode_fkey" FOREIGN KEY ("programmeCode") REFERENCES "Programme"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_studyGroupKey_fkey" FOREIGN KEY ("studyGroupKey") REFERENCES "ProgrammeGroup"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_programmeCode_fkey" FOREIGN KEY ("programmeCode") REFERENCES "Programme"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_facultyCode_fkey" FOREIGN KEY ("facultyCode") REFERENCES "Faculty"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeGroup" ADD CONSTRAINT "ProgrammeGroup_programmeCode_fkey" FOREIGN KEY ("programmeCode") REFERENCES "Programme"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAudience" ADD CONSTRAINT "CourseAudience_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAudience" ADD CONSTRAINT "CourseAudience_groupKey_fkey" FOREIGN KEY ("groupKey") REFERENCES "ProgrammeGroup"("key") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Source-backed reference catalogue; no enrollment or attendance is inferred.
INSERT INTO "Faculty" (code,name) VALUES ('medicine','Faculty of Medicine');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('MBR','MBChB (Medicine & Surgery)','medicine',5,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('PHA','B. Pharmacy (BPharm)','medicine',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BNS','BSc Nursing Science','medicine',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('MLS','BSc Medical Lab Science','medicine',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BSP','BSc Physiotherapy','medicine',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('PHS','BSc Pharmaceutical Sciences','medicine',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('DCM','Dip. Community HIV/AIDS Care & Mgt','medicine',2,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('DEM','Dip. Emergency Medicine','medicine',2,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('DCAM','Adv. Dip. Child & Adolescent Mental Health','medicine',2,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Faculty" (code,name) VALUES ('science','Faculty of Science');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BS','BSc Education (BSc.Ed)','science',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('DLT','Dip. Science Laboratory Technology','science',2,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('HEAP','Higher Education Access Cert.','science',1,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Faculty" (code,name) VALUES ('fast','Faculty of Applied Sciences and Technology');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BME','BEng Biomedical Engineering','fast',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('EEE','BEng Electrical & Electronics Engineering','fast',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('PEEM','BSc Petroleum Engineering & Env. Mgt','fast',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('CVE','BSc Civil Engineering','fast',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('MIE','BSc Mechanical & Industrial Engineering','fast',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Faculty" (code,name) VALUES ('computing','Faculty of Computing and Informatics');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BCS','BSc Computer Science','computing',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BIT','B. Information Technology','computing',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BSE','B.Sc. in Software Engineering','computing',4,'https://www.must.ac.ug/programme/bachelor-of-software-engineering/');
INSERT INTO "Faculty" (code,name) VALUES ('business','Faculty of Business and Management Sciences');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BBA','B. Business Administration','business',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BSAF','BSc Accounting & Finance','business',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('ECO','BSc Economics','business',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BPSM','BSc Procurement & Supply Chain Mgt','business',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Faculty" (code,name) VALUES ('interdisciplinary','Faculty of Interdisciplinary Studies');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BSAL','BSc Agriculture & Livelihoods','interdisciplinary',4,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BGWH','BSc Gender & Applied Women Health','interdisciplinary',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "Programme" (code,name,"facultyCode","durationYears","sourceUrl") VALUES ('BPCD','BSc Planning & Community Dev.','interdisciplinary',3,'https://github.com/mugmarp/mylectures-2/blob/62a6e27fbdd0b13b109fa86861207bf671852f59/app/src/main/java/com/lectures/features/onboarding/FacultyData.kt');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MBR I','MBR',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MBR II','MBR',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MBR III','MBR',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MBR IV','MBR',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MBR V','MBR',5,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PHA I','PHA',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PHA II','PHA',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PHA III','PHA',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PHA IV','PHA',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BNS I','BNS',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BNS II','BNS',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BNS III','BNS',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BNS IV','BNS',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MLS I','MLS',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MLS II','MLS',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MLS III','MLS',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MLS IV','MLS',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSP I','BSP',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSP II','BSP',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSP III','BSP',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSP IV','BSP',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PHS I','PHS',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PHS II','PHS',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PHS III','PHS',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DCM I','DCM',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DCM II','DCM',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DEM I','DEM',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DEM II','DEM',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DCAM I','DCAM',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DCAM II','DCAM',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS I','BS',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS II','BS',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS III','BS',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DLT I','DLT',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DLT II','DLT',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('HEAP I','HEAP',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BME I','BME',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BME II','BME',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BME III','BME',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BME IV','BME',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('EEE I','EEE',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('EEE II','EEE',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('EEE III','EEE',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('EEE IV','EEE',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PEEM I','PEEM',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PEEM II','PEEM',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PEEM III','PEEM',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('PEEM IV','PEEM',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('CVE I','CVE',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('CVE II','CVE',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('CVE III','CVE',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('CVE IV','CVE',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MIE I','MIE',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MIE II','MIE',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MIE III','MIE',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('MIE IV','MIE',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BCS I','BCS',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BCS II','BCS',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BCS III','BCS',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BIT I','BIT',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BIT II','BIT',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BIT III','BIT',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSE I','BSE',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSE II','BSE',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSE III','BSE',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSE IV','BSE',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BBA I','BBA',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BBA II','BBA',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BBA III','BBA',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSAF I','BSAF',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSAF II','BSAF',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSAF III','BSAF',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('ECO I','ECO',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('ECO II','ECO',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('ECO III','ECO',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BPSM I','BPSM',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BPSM II','BPSM',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BPSM III','BPSM',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSAL I','BSAL',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSAL II','BSAL',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSAL III','BSAL',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BSAL IV','BSAL',4,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BGWH I','BGWH',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BGWH II','BGWH',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BGWH III','BGWH',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BPCD I','BPCD',1,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BPCD II','BPCD',2,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BPCD III','BPCD',3,'');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BBA ACCOUNTING III','BBA',3,'ACCOUNTING');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BBA TAXATION II','BBA',2,'TAXATION');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BBA BANKING AND FINANCE III','BBA',3,'BANKING AND FINANCE');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS BIOLOGICAL III','BS',3,'BIOLOGICAL');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS MATHEMATICS III','BS',3,'MATHEMATICS');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS PHYSICS III','BS',3,'PHYSICS');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS CHEMISTRY III','BS',3,'CHEMISTRY');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BBA PROCUREMENT III','BBA',3,'PROCUREMENT');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS BIOLOGICAL II','BS',2,'BIOLOGICAL');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS CHEM MATHS II','BS',2,'CHEM MATHS');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS PHYSICAL II','BS',2,'PHYSICAL');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS BIOLOGICAL I','BS',1,'BIOLOGICAL');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS CHEM MATHS I','BS',1,'CHEM MATHS');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BS PHYSICAL I','BS',1,'PHYSICAL');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('HEAP BIOLOGY-CHEMISTRY','HEAP',1,'BIOLOGY-CHEMISTRY');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('HEAP CHEMISTRY-MATHS','HEAP',1,'CHEMISTRY-MATHS');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('HEAP PHYSICS-MATHS','HEAP',1,'PHYSICS-MATHS');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DLT BIOLOGICAL II','DLT',2,'BIOLOGICAL');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DLT CHEMISTRY II','DLT',2,'CHEMISTRY');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('DLT PHYSICS II','DLT',2,'PHYSICS');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BBA HUMAN RESOURCE III','BBA',3,'HUMAN RESOURCE');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BBA MARKETING III','BBA',3,'MARKETING');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BPCD SUSTAINABLE RURAL DEVELOPMENT III','BPCD',3,'SUSTAINABLE RURAL DEVELOPMENT');
INSERT INTO "ProgrammeGroup" (key,"programmeCode","studyYear",track) VALUES ('BPCD URBAN POLICY III','BPCD',3,'URBAN POLICY');
UPDATE "User" u SET "programmeCode"=p.code FROM "Programme" p WHERE upper(trim(u.program))=p.code;
UPDATE "User" u SET "studyGroupKey"=g.key FROM "ProgrammeGroup" g WHERE u."programmeCode"=g."programmeCode" AND u.year=g."studyYear" AND g.track='';
UPDATE "Course" c SET "programmeCode"=p.code FROM "Programme" p WHERE upper(trim(c.program))=p.code;
INSERT INTO "CourseAudience" ("courseId","groupKey") SELECT c.id,g.key FROM "Course" c JOIN "ProgrammeGroup" g ON c."programmeCode"=g."programmeCode" AND c.year=g."studyYear" AND g.track='';
