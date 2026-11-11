import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
let app: import("express").Express;
let examiner: string,
  other: string,
  student: string,
  stranger: string,
  admin: string;
let courseId: string,
  activeId: string,
  futureId: string,
  zeroCourse: string,
  studentId: string,
  pastAbsent: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const login = async (email: string) => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "TestPassword2026!" });
  assert.equal(res.status, 200);
  return res.body.accessToken as string;
};
before(async () => {
  if (
    !process.env.DATABASE_URL ||
    new URL(process.env.DATABASE_URL).pathname !== "/sams_test"
  )
    throw new Error(
      "Tests require an isolated DATABASE_URL ending in /sams_test",
    );
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-access-secret-at-least-32-characters";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-at-least-32-characters";
  app = (await import("../src/app")).default;
  await db.attendanceChange.deleteMany();
  await db.attendance.deleteMany();
  await db.enrollment.deleteMany();
  await db.session.deleteMany();
  await db.course.deleteMany();
  await db.user.deleteMany();
  const passwordHash = await bcrypt.hash("TestPassword2026!", 4);
  const teacher = await db.user.create({
    data: {
      name: "Teacher",
      email: "teacher@test.example",
      role: "EXAMINER",
      passwordHash,
    },
  });
  await db.user.create({
    data: {
      name: "Other",
      email: "other@test.example",
      role: "EXAMINER",
      passwordHash,
    },
  });
  const learner = await db.user.create({
    data: {
      name: "Learner",
      email: "learner@test.example",
      role: "STUDENT",
      passwordHash,
      regNo: "TEST/001",
    },
  });
  studentId = learner.id;
  await db.user.create({
    data: {
      name: "Stranger",
      email: "stranger@test.example",
      role: "STUDENT",
      passwordHash,
    },
  });
  await db.user.create({
    data: {
      name: "Admin",
      email: "admin@test.example",
      role: "ADMIN",
      passwordHash,
    },
  });
  const c = await db.course.create({
    data: {
      code: "TEST1",
      title: "Test course",
      program: "BSE",
      year: 2,
      semester: 1,
      academicYear: "2026/2027",
      examinerId: teacher.id,
    },
  });
  courseId = c.id;
  const zero = await db.course.create({
    data: {
      code: "TEST0",
      title: "No sessions",
      program: "BSE",
      year: 2,
      semester: 1,
      academicYear: "2026/2027",
      examinerId: teacher.id,
    },
  });
  zeroCourse = zero.id;
  for (const id of [courseId, zeroCourse])
    await db.enrollment.create({ data: { studentId, courseId: id } });
  for (let i = 0; i < 5; i++) {
    const s = await db.session.create({
      data: {
        naturalKey: `test:past:${i}`,
        courseId,
        startTime: new Date(Date.now() - 86400000 * (i + 1)),
        endTime: new Date(Date.now() - 86400000 * (i + 1) + 3600000),
        status: "COMPLETED",
      },
    });
    await db.attendance.create({
      data: {
        studentId,
        sessionId: s.id,
        status: i < 4 ? "PRESENT" : "ABSENT",
        method: "MANUAL",
      },
    });
    if (i === 4) pastAbsent = s.id;
  }
  activeId = (
    await db.session.create({
      data: {
        naturalKey: "test:active",
        courseId,
        startTime: new Date(Date.now() - 600000),
        endTime: new Date(Date.now() + 3600000),
      },
    })
  ).id;
  futureId = (
    await db.session.create({
      data: {
        naturalKey: "test:future",
        courseId,
        startTime: new Date(Date.now() + 86400000),
        endTime: new Date(Date.now() + 90000000),
      },
    })
  ).id;
  examiner = await login("teacher@test.example");
  other = await login("other@test.example");
  student = await login("learner@test.example");
  stranger = await login("stranger@test.example");
  admin = await login("admin@test.example");
});
after(async () => {
  await db.$disconnect();
  const { prisma } = await import("../src/config/db");
  await prisma.$disconnect();
});
test("auth failures and role/ownership boundaries are enforced", async () => {
  assert.equal(
    (await request(app).get("/api/student/sessions/upcoming")).status,
    401,
  );
  assert.equal(
    (await request(app).get("/api/admin/courses").set(auth(student))).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/examiner/sessions/${activeId}`)
        .set(auth(other))
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .get(`/api/examiner/sessions/${activeId}`)
        .set(auth(admin))
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/login")
        .send({ email: "teacher@test.example", password: "wrong" })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/student/checkin")
        .set(auth(student))
        .send({})
    ).status,
    400,
  );
});
test("reports exclude future/scheduled sessions and retain zero-session enrollments", async () => {
  const res = await request(app)
    .get(`/api/admin/eligibility/${courseId}`)
    .set(auth(admin));
  assert.equal(res.status, 200);
  assert.equal(res.body.students[0].totalSessions, 5);
  assert.equal(res.body.students[0].attendancePct, 80);
  assert.equal(res.body.students[0].eligible, true);
  const zero = await request(app)
    .get(`/api/admin/eligibility/${zeroCourse}`)
    .set(auth(admin));
  assert.equal(zero.body.students[0].attendancePct, null);
  assert.equal(
    (
      await request(app)
        .get("/api/student/attendance/summary")
        .set(auth(student))
    ).body.length,
    2,
  );
});
test("active classes remain visible and student responses never reveal code secrets", async () => {
  await request(app)
    .post(`/api/examiner/sessions/${activeId}/start-checkin`)
    .set(auth(examiner))
    .expect(200);
  const res = await request(app)
    .get("/api/student/sessions/upcoming")
    .set(auth(student))
    .expect(200);
  assert.ok(res.body.some((s: { id: string }) => s.id === activeId));
  assert.equal(
    /checkinSecret|checkinStartedAt|checkinClosesAt|activeCode|checkinCode/.test(
      JSON.stringify(res.body),
    ),
    false,
  );
  assert.equal(
    (
      await request(app)
        .post(`/api/examiner/sessions/${futureId}/start-checkin`)
        .set(auth(examiner))
    ).status,
    400,
  );
});
test("code validation rejects unenrolled students and accepts concurrent submissions once", async () => {
  const start = await request(app)
    .post(`/api/examiner/sessions/${activeId}/start-checkin`)
    .set(auth(examiner))
    .expect(200);
  const code = start.body.code;
  await request(app)
    .post("/api/student/checkin")
    .set(auth(stranger))
    .send({ sessionId: activeId, code })
    .expect(403);
  await request(app)
    .post("/api/student/checkin")
    .set(auth(student))
    .send({ sessionId: activeId, code: "AAAAAA" })
    .expect(400);
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      request(app)
        .post("/api/student/checkin")
        .set(auth(student))
        .send({ sessionId: activeId, code }),
    ),
  );
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(responses.filter((r) => !r.body.duplicate).length, 1);
  assert.equal(
    await db.attendance.count({ where: { studentId, sessionId: activeId } }),
    1,
  );
  const roster = await request(app)
    .get(`/api/examiner/sessions/${activeId}/attendance`)
    .set(auth(examiner))
    .expect(200);
  assert.equal(roster.body.length, 1);
});
test("rotation is authoritative after a new read, and stop closes the window", async () => {
  const initial = (
    await request(app)
      .post(`/api/examiner/sessions/${activeId}/start-checkin`)
      .set(auth(examiner))
  ).body.code;
  await db.session.update({
    where: { id: activeId },
    data: { checkinStartedAt: new Date(Date.now() - 121000) },
  });
  const view = await request(app)
    .get(`/api/examiner/sessions/${activeId}`)
    .set(auth(examiner))
    .expect(200);
  assert.notEqual(view.body.activeCode.code, initial);
  const { currentCode } = await import("../src/services/rules");
  const stored = await db.session.findUniqueOrThrow({
    where: { id: activeId },
  });
  assert.equal(
    view.body.activeCode.code,
    currentCode(
      stored.checkinSecret!,
      stored.checkinStartedAt!,
      stored.checkinClosesAt!,
    )!.code,
  );
  await request(app)
    .post(`/api/examiner/sessions/${activeId}/stop-checkin`)
    .set(auth(examiner))
    .expect(200);
  assert.equal(
    (
      await request(app)
        .get(`/api/examiner/sessions/${activeId}`)
        .set(auth(examiner))
    ).body.activeCode,
    null,
  );
});
test("manual corrections require a reason, retain actor/history and count late attendance", async () => {
  const url = `/api/examiner/sessions/${pastAbsent}/attendance`;
  await request(app)
    .post(url)
    .set(auth(examiner))
    .send({ studentId, status: "LATE", reason: "x" })
    .expect(400);
  await request(app)
    .post(url)
    .set(auth(other))
    .send({ studentId, status: "LATE", reason: "Verified register" })
    .expect(403);
  await request(app)
    .post(url)
    .set(auth(examiner))
    .send({
      studentId,
      status: "LATE",
      reason: "Verified against paper register",
    })
    .expect(200);
  const record = await db.attendanceChange.findFirstOrThrow();
  assert.equal(record.previousStatus, "ABSENT");
  assert.equal(record.status, "LATE");
  const report = await request(app)
    .get(`/api/admin/eligibility/${courseId}`)
    .set(auth(admin));
  assert.equal(report.body.students[0].attendancePct, 100);
});
test("completion counts the class and prevents reopening; cancellation excludes it", async () => {
  await request(app)
    .post(`/api/examiner/sessions/${activeId}/complete`)
    .set(auth(examiner))
    .expect(200);
  await request(app)
    .post(`/api/examiner/sessions/${activeId}/start-checkin`)
    .set(auth(examiner))
    .expect(400);
  await request(app)
    .post(`/api/examiner/sessions/${futureId}/complete`)
    .set(auth(examiner))
    .expect(400);
  await request(app)
    .post(`/api/examiner/sessions/${futureId}/cancel`)
    .set(auth(examiner))
    .expect(200);
  const report = await request(app)
    .get(`/api/admin/eligibility/${courseId}`)
    .set(auth(admin));
  assert.equal(report.body.students[0].totalSessions, 6);
});
test("refresh response includes user; invalid refresh tokens are rejected", async () => {
  const signed = await request(app)
    .post("/api/auth/login")
    .send({ email: "learner@test.example", password: "TestPassword2026!" })
    .expect(200);
  const renewed = await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: signed.body.refreshToken })
    .expect(200);
  assert.equal(renewed.body.user.id, studentId);
  await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: signed.body.accessToken })
    .expect(401);
});
test("PDF handles empty and multi-page reports", async () => {
  const empty = await request(app)
    .get(`/api/admin/eligibility/${zeroCourse}/pdf`)
    .set(auth(admin))
    .expect(200);
  assert.match(empty.headers["content-type"], /application\/pdf/);
  assert.ok(empty.body.subarray(0, 4).equals(Buffer.from("%PDF")));
  for (let i = 0; i < 45; i++) {
    const u = await db.user.create({
      data: {
        email: `pdf${i}@test.example`,
        name: `PDF Student ${i}`,
        regNo: `PDF/${i}`,
        passwordHash: "unused",
      },
    });
    await db.enrollment.create({ data: { studentId: u.id, courseId } });
  }
  const pdf = await request(app)
    .get(`/api/admin/eligibility/${courseId}/pdf`)
    .set(auth(admin))
    .expect(200);
  assert.ok(
    (pdf.body.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length >= 2,
  );
});

test("local imports are repeatable and roll back on identity conflicts", async () => {
  const { importDataset } = await import("../scripts/import");
  const data = {
    users: [
      { email: "teacher@import.test", name: "Teacher", role: "EXAMINER" },
      {
        email: "student@import.test",
        name: "Student",
        role: "STUDENT",
        regNo: "IMPORT/001",
      },
    ],
    courses: [
      {
        key: "c",
        code: "IMP",
        title: "Import course",
        academicYear: "2026/2027",
        semester: 1,
        year: 2,
        program: "BSE",
        examinerEmail: "teacher@import.test",
      },
    ],
    enrollments: [{ studentEmail: "student@import.test", courseKey: "c" }],
    sessions: [
      {
        naturalKey: "import:test:one",
        courseKey: "c",
        startTime: "2026-11-11T10:00:00+03:00",
        endTime: "2026-11-11T12:00:00+03:00",
      },
    ],
  };
  await importDataset(db, data, "InitialImportPassword!");
  const before = await db.session.count();
  await importDataset(db, data, "DifferentInitialPassword!");
  assert.equal(await db.session.count(), before);
  const changed = {
    ...data,
    users: [
      ...data.users,
      {
        email: "rollback@import.test",
        name: "Rollback",
        role: "STUDENT",
        regNo: "IMPORT/002",
      },
    ],
    sessions: [{ ...data.sessions[0], endTime: "2026-11-11T13:00:00+03:00" }],
  };
  await assert.rejects(
    () => importDataset(db, changed, "InitialImportPassword!"),
    /Session identity conflict/,
  );
  assert.equal(
    await db.user.findUnique({ where: { email: "rollback@import.test" } }),
    null,
  );
});

test("a stale offline code cannot create attendance after rotation or closure", async () => {
  const hash = await bcrypt.hash("TestPassword2026!", 4);
  const learner = await db.user.create({
    data: {
      email: "offline@test.example",
      name: "Offline student",
      regNo: "OFFLINE/001",
      role: "STUDENT",
      passwordHash: hash,
    },
  });
  await db.enrollment.create({ data: { studentId: learner.id, courseId } });
  const s = await db.session.create({
    data: {
      naturalKey: "test:offline-window",
      courseId,
      startTime: new Date(Date.now() - 60000),
      endTime: new Date(Date.now() + 3600000),
    },
  });
  const token = await login("offline@test.example");
  const opened = await request(app)
    .post(`/api/examiner/sessions/${s.id}/start-checkin`)
    .set(auth(examiner))
    .expect(200);
  await db.session.update({
    where: { id: s.id },
    data: { checkinStartedAt: new Date(Date.now() - 121000) },
  });
  await request(app)
    .post("/api/student/checkin")
    .set(auth(token))
    .send({ sessionId: s.id, code: opened.body.code })
    .expect(400);
  const current = await request(app)
    .get(`/api/examiner/sessions/${s.id}`)
    .set(auth(examiner))
    .expect(200);
  await request(app)
    .post(`/api/examiner/sessions/${s.id}/stop-checkin`)
    .set(auth(examiner))
    .expect(200);
  await request(app)
    .post("/api/student/checkin")
    .set(auth(token))
    .send({ sessionId: s.id, code: current.body.activeCode.code })
    .expect(400);
  assert.equal(
    await db.attendance.count({
      where: { studentId: learner.id, sessionId: s.id },
    }),
    0,
  );
});
