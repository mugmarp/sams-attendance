// backend/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SALT_ROUNDS = 12;
const DATA_DIR = path.resolve(__dirname, '../../data');

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function parseCSV(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => obj[h] = values[i]?.trim() ?? '');
    return obj;
  });
}

async function main() {
  console.log('🌱 Starting database seed...');
  
  // 1. Create admin users
  console.log('Creating admin users...');
  const adminPassword = await hashPassword('admin123');
  await prisma.user.upsert({
    where: { email: 'admin@must.ac.ug' },
    update: {},
    create: {
      email: 'admin@must.ac.ug',
      passwordHash: adminPassword,
      role: 'ADMIN',
      name: 'System Administrator',
    },
  });
  
  await prisma.user.upsert({
    where: { email: 'registrar@must.ac.ug' },
    update: {},
    create: {
      email: 'registrar@must.ac.ug',
      passwordHash: adminPassword,
      role: 'ADMIN',
      name: 'Academic Registrar',
    },
  });
  
  // 2. Create student users from CSV
  console.log('Creating student users...');
  const studentsCsv = parseCSV(path.join(DATA_DIR, 'students.csv'));
  const studentPassword = await hashPassword('student123');
  
  for (const row of studentsCsv) {
    await prisma.user.upsert({
      where: { email: row.email },
      update: {},
      create: {
        email: row.email,
        passwordHash: studentPassword,
        role: 'STUDENT',
        regNo: row.regNo,
        name: row.name,
        program: row.program,
        year: parseInt(row.year),
      },
    });
  }
  console.log(`Created ${studentsCsv.length} students`);
  
  // 3. Create examiner users from timetable lecturers
  console.log('Loading timetable data...');
  const timetablePath = path.join(DATA_DIR, 'timetable_export.json');
  const timetable = JSON.parse(fs.readFileSync(timetablePath, 'utf-8'));
  
  // Extract unique lecturers
  const lecturers = [...new Set(timetable.map((s: any) => s.lecturer).filter(Boolean))];
  const examinerPassword = await hashPassword('examiner123');
  
  for (const lecturer of lecturers) {
    const email = lecturer.toLowerCase().replace(/[^a-z]/g, '.') + '@must.ac.ug';
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash: examinerPassword,
        role: 'EXAMINER',
        name: lecturer,
      },
    });
  }
  console.log(`Created ${lecturers.length} examiners`);
  
  // 4. Create courses from timetable
  console.log('Creating courses...');
  const courseMap = new Map<string, { code: string; title: string; program: string; year: number; semester: number }>();
  
  for (const session of timetable) {
    if (!session.course_code || !session.course_title) continue;
    
    const key = session.course_code;
    if (!courseMap.has(key)) {
      // Parse program_group to get program/year
      const pg = session.program_group;
      let program = 'BSE';
      let year = 2;
      
      if (pg.includes('BSE')) { program = 'BSE'; year = pg.includes('III') ? 3 : pg.includes('IV') ? 4 : pg.includes('I') ? 1 : 2; }
      else if (pg.includes('BCS')) { program = 'BCS'; year = pg.includes('III') ? 3 : pg.includes('IV') ? 4 : pg.includes('II') ? 2 : 1; }
      else if (pg.includes('BBA')) { program = 'BBA'; year = pg.includes('III') ? 3 : pg.includes('II') ? 2 : 1; }
      else if (pg.includes('BIT')) { program = 'BIT'; year = pg.includes('III') ? 3 : pg.includes('II') ? 2 : 1; }
      else if (pg.includes('BPCD')) { program = 'BPCD'; year = pg.includes('III') ? 3 : pg.includes('II') ? 2 : 1; }
      else if (pg.includes('BSAF')) { program = 'BSAF'; year = pg.includes('IV') ? 4 : pg.includes('III') ? 3 : pg.includes('II') ? 2 : 1; }
      else if (pg.includes('ECO')) { program = 'ECO'; year = pg.includes('III') ? 3 : pg.includes('II') ? 2 : 1; }
      else if (pg.includes('PEM')) { program = 'PEM'; year = pg.includes('III') ? 3 : pg.includes('II') ? 2 : 1; }
      else if (pg.includes('MIE')) { program = 'MIE'; year = pg.includes('IV') ? 4 : pg.includes('III') ? 3 : pg.includes('II') ? 2 : 1; }
      else if (pg.includes('DLT')) { program = 'DLT'; year = pg.includes('II') ? 2 : 1; }
      else if (pg.includes('HEAP')) { program = 'HEAP'; year = 1; }
      else if (pg.includes('MATHS PG')) { program = 'MSC'; year = 1; }
      else if (pg.includes('MED') || pg.includes('PCH') || pg.includes('OBG') || pg.includes('SUG')) { program = 'MBR'; year = 3; }
      
      courseMap.set(key, {
        code: session.course_code,
        title: session.course_title,
        program,
        year,
        semester: 1, // Current semester
      });
    }
  }
  
  for (const [code, data] of courseMap) {
    // Find examiner for this course
    const sessionsForCourse = timetable.filter((s: any) => s.course_code === code);
    const lecturer = sessionsForCourse[0]?.lecturer;
    let examinerId: string | undefined;
    
    if (lecturer) {
      const examiner = await prisma.user.findFirst({
        where: { name: lecturer, role: 'EXAMINER' },
      });
      examinerId = examiner?.id;
    }
    
    await prisma.course.upsert({
      where: { code },
      update: {},
      create: {
        code,
        title: data.title,
        program: data.program,
        year: data.year,
        semester: data.semester,
        examinerId,
      },
    });
  }
  console.log(`Created ${courseMap.size} courses`);
  
  // 5. Create sessions from timetable
  console.log('Creating sessions...');
  let sessionCount = 0;
  
  for (const session of timetable) {
    if (!session.course_code) continue;
    
    const course = await prisma.course.findUnique({ where: { code: session.course_code } });
    if (!course) continue;
    
    // Parse date from day + start_time
    // We'll use a reference date for Semester I 2026/27
    const dayMap: Record<string, number> = {
      Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0,
    };
    
    const dayOfWeek = dayMap[session.day];
    if (dayOfWeek === undefined) continue;
    
    // Calculate date: Semester starts ~Oct 29, 2026 (from academic calendar)
    // Find first occurrence of this day on or after Oct 29
    const semesterStart = new Date('2026-10-29');
    const startDay = semesterStart.getDay();
    const daysUntil = (dayOfWeek - startDay + 7) % 7;
    const sessionDate = new Date(semesterStart);
    sessionDate.setDate(semesterStart.getDate() + daysUntil);
    
    // Add weeks based on which occurrence (simplified: just use first week)
    // In reality, you'd need to track which week each session is
    sessionDate.setHours(0, 0, 0, 0);
    
    const [startHour, startMin] = session.start_time.split(':').map(Number);
    const [endHour, endMin] = session.end_time.split(':').map(Number);
    
    const startTime = new Date(sessionDate);
    startTime.setHours(startHour, startMin, 0, 0);
    
    const endTime = new Date(sessionDate);
    endTime.setHours(endHour, endMin, 0, 0);
    
    // Map session_type
    let sessionType: 'LECTURE' | 'TUTORIAL' | 'PRACTICAL' | 'LAB' | 'CLINICAL' = 'LECTURE';
    const st = (session.session_type || '').toUpperCase();
    if (st.includes('TUTORIAL')) sessionType = 'TUTORIAL';
    else if (st.includes('PRACTICAL') || st.includes('LAB')) sessionType = 'PRACTICAL';
    else if (st === 'LAB') sessionType = 'LAB';
    else if (st === 'CLINICAL') sessionType = 'CLINICAL';
    
    // Resolve floor
    const floor = resolveFloor(session.room);
    
    await prisma.session.create({
      data: {
        courseId: course.id,
        date: sessionDate,
        startTime,
        endTime,
        room: session.room || null,
        sessionType,
        // Floor would need a field in schema - skipping for now
      },
    });
    sessionCount++;
  }
  console.log(`Created ${sessionCount} sessions`);
  
  // 6. Create enrollments from CSV
  console.log('Creating enrollments...');
  const enrollmentsCsv = parseCSV(path.join(DATA_DIR, 'enrollments.csv'));
  let enrollmentCount = 0;
  
  for (const row of enrollmentsCsv) {
    const student = await prisma.user.findUnique({ where: { regNo: row.regNo } });
    const course = await prisma.course.findUnique({ where: { code: row.courseCode } });
    
    if (student && course) {
      await prisma.enrollment.upsert({
        where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
        update: {},
        create: { studentId: student.id, courseId: course.id },
      });
      enrollmentCount++;
    }
  }
  console.log(`Created ${enrollmentCount} enrollments`);
  
  console.log('✅ Seed completed successfully!');
}

function resolveFloor(room: string | null): number | null {
  if (!room) return null;
  
  const ROOM_FLOORS: Record<string, number> = {
    'GFL01': 0, 'GFL02': 0, 'GFS02': 0, 'MLT': 0, 'PAT LAB': 0,
    'SFL01': 0, 'SFL02': 0, 'SFS01': 0, 'SFS02': 0, 'TFL01': 0, 'TFL02': 0,
    'IMSG01': 1, 'IMSG02': 1, 'IMSG03': 1, 'IMSG04': 1,
    'Pharmacy L1': 1, 'S103': 1, 'S109': 1, 'S202': 1, 'S204': 1,
    'Pharmacy L2': 2, 'S205': 2, 'S210': 2, 'S211': 2,
    'Pharmacy L3': 3, 'S310': 3, 'S311': 3,
    'S403': 4,
    'Wards': 1, 'OBG Ward': 1, 'Medical Ward': 1, 'Paediatric Ward': 1,
    'Surgical Ward': 1, 'Simulation LAB': 1,
    'Kihumuro Library Room 1-LEVEL 1': 1, 'Kihumuro Library Room 2- LEVEL 1': 1,
    'Kihumuro Library Room 3-LEVEL 2': 2, 'Kihumuro Library Room 4-LEVEL 2': 2,
  };
  
  if (ROOM_FLOORS[room]) return ROOM_FLOORS[room];
  
  const upper = room.toUpperCase();
  if (/\b(GROUND|GRND|GF|LG)\b/.test(upper) || /^[A-Z]?G\d{1,3}\b/.test(upper)) return 0;
  if (/\b(1ST|FIRST|LEVEL\s+1|FLOOR\s+1|L1)\b/.test(upper) || /^[A-Z]?1\d{2}\b/.test(upper)) return 1;
  if (/\b(2ND|SECOND|LEVEL\s+2|FLOOR\s+2|L2)\b/.test(upper) || /^[A-Z]?2\d{2}\b/.test(upper)) return 2;
  if (/\b(3RD|THIRD|LEVEL\s+3|FLOOR\s+3|L3)\b/.test(upper) || /^[A-Z]?3\d{2}\b/.test(upper)) return 3;
  if (/\b(4TH|FOURTH|LEVEL\s+4|FLOOR\s+4|L4)\b/.test(upper) || /^[A-Z]?4\d{2}\b/.test(upper)) return 4;
  
  return null;
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });