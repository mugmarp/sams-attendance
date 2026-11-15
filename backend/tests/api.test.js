import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
let app;
let examiner, other, student, stranger, admin;
let courseId, activeId, futureId, zeroCourse, studentId, pastAbsent;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const login = async (email) => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "TestPassword2026!" });
  assert.equal(res.status, 200);
  return res.body.accessToken;
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
  app = (await import("../src/app.js")).default;
  await db.studentCourseSetup.deleteMany();
  await db.coursePlanItem.deleteMany();
  await db.coursePlan.deleteMany();
  await db.auditEvent.deleteMany();
  await db.reportSnapshot.deleteMany();
  await db.timetableReview.deleteMany();
  await db.syncReceipt.deleteMany();
  await db.offlinePreparation.deleteMany();
  await db.attendanceClaim.deleteMany();
  await db.attendanceChange.deleteMany();
  await db.attendance.deleteMany();
  await db.enrollment.deleteMany();
  await db.session.deleteMany();
  await db.timetableEntry.deleteMany();
  await db.academicTerm.deleteMany();
  await db.timetablePublication.deleteMany();
  await db.courseAudience.deleteMany();
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
      program: "BSE",
      programmeCode: "BSE",
      year: 2,
      studyGroupKey: "BSE II",
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
  const { prisma } = await import("../src/config/db.js");
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
  assert.ok(res.body.some((s) => s.id === activeId));
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
  const { currentCode } = await import("../src/services/rules.js");
  const stored = await db.session.findUniqueOrThrow({
    where: { id: activeId },
  });
  assert.equal(
    view.body.activeCode.code,
    currentCode(
      stored.checkinSecret,
      stored.checkinStartedAt,
      stored.checkinClosesAt,
    ).code,
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
  const { importDataset } = await import("../scripts/import.js");
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

test("administrators provision accounts, offerings and enrollment; owners create validated classes", async () => {
  const teacher = await db.user.findUniqueOrThrow({
    where: { email: "teacher@test.example" },
  });
  const body = {
    email: "setup@test.example",
    name: "Setup Learner",
    password: "SetupPassword2026!",
    role: "STUDENT",
    regNo: "SETUP/001",
  };
  const learner = await request(app)
    .post("/api/admin/users")
    .set(auth(admin))
    .send(body)
    .expect(201);
  assert.equal(learner.body.passwordHash, undefined);
  await request(app)
    .post("/api/admin/users")
    .set(auth(admin))
    .send(body)
    .expect(409);
  await request(app)
    .post("/api/admin/users")
    .set(auth(student))
    .send({ ...body, email: "blocked@test.example" })
    .expect(403);
  const courseBody = {
    code: "SETUP1",
    title: "Setup course",
    program: "BSE",
    year: 2,
    semester: 1,
    academicYear: "2026/2027",
    examinerId: teacher.id,
    attendanceThreshold: 75,
  };
  const course = await request(app)
    .post("/api/admin/courses")
    .set(auth(admin))
    .send(courseBody)
    .expect(201);
  await request(app)
    .post("/api/admin/courses")
    .set(auth(admin))
    .send({ ...courseBody, code: "INVALID", attendanceThreshold: 101 })
    .expect(400);
  const enroll = `/api/admin/courses/${course.body.id}/enroll`;
  await request(app)
    .post(enroll)
    .set(auth(admin))
    .send({ studentId: learner.body.id })
    .expect(201);
  await request(app)
    .post(enroll)
    .set(auth(admin))
    .send({ studentId: learner.body.id })
    .expect(409);
  const path = `/api/examiner/courses/${course.body.id}/sessions`,
    startTime = new Date(Date.now() - 60000).toISOString(),
    endTime = new Date(Date.now() + 3600000).toISOString();
  await request(app)
    .post(path)
    .set(auth(other))
    .send({ startTime, endTime, room: "Lab" })
    .expect(403);
  await request(app)
    .post(path)
    .set(auth(examiner))
    .send({ startTime: endTime, endTime: startTime, room: "Lab" })
    .expect(400);
  const created = await request(app)
    .post(path)
    .set(auth(examiner))
    .send({ startTime, endTime, room: "Lab" })
    .expect(201);
  assert.equal(created.body.status, "SCHEDULED");
  const report = await request(app)
    .get(`/api/admin/eligibility/${course.body.id}`)
    .set(auth(admin))
    .expect(200);
  assert.equal(report.body.course.attendanceThreshold, 75);
  await request(app)
    .get(`/api/examiner/courses/${course.body.id}/attendance-summary`)
    .set(auth(examiner))
    .expect(200);
  await request(app)
    .get(`/api/examiner/courses/${course.body.id}/attendance-summary`)
    .set(auth(other))
    .expect(403);
  await request(app)
    .get(`/api/examiner/courses/${course.body.id}/attendance-summary/pdf`)
    .set(auth(examiner))
    .expect(200);
});

test("live dates use server time and invalid calendar days are rejected", async () => {
  const before = Date.now();
  const health = await request(app).get("/api/health").expect(200);
  assert.equal(health.body.timeZone, "Africa/Kampala");
  assert.ok(
    Date.parse(health.body.now) >= before &&
      Date.parse(health.body.now) <= Date.now(),
  );
  await request(app)
    .get("/api/examiner/sessions/today?date=2026-02-31")
    .set(auth(examiner))
    .expect(400);
});

test("queued check-ins reject an originating account different from the token", async () => {
  await request(app)
    .post("/api/student/checkin")
    .set(auth(student))
    .send({
      sessionId: activeId,
      code: "ABC234",
      originatingUserId: (
        await db.user.findUnique({ where: { email: "stranger@test.example" } })
      ).id,
    })
    .expect(403);
});

async function freshClass() {
  return db.session.create({
    data: {
      courseId,
      naturalKey: "offline-test:" + randomUUID(),
      startTime: new Date(Date.now() - 60000),
      endTime: new Date(Date.now() + 3600000),
    },
  });
}
async function preparation(session, purpose = "MARK", token = examiner) {
  return (
    await request(app)
      .post("/api/sync/preparations")
      .set(auth(token))
      .send({ sessionId: session.id, purpose })
      .expect(201)
  ).body;
}
function markOperation(bundle, override = {}) {
  const row = bundle.roster.find((r) => r.student.id === studentId);
  return {
    operationId: randomUUID(),
    type: "MARK",
    sessionId: bundle.session.id,
    preparationId: bundle.id,
    studentId,
    baseSessionVersion: bundle.session.version,
    baseAttendanceVersion: row.attendance?.version || 0,
    observedAt: new Date().toISOString(),
    status: "PRESENT",
    reason: "Observed during the class",
    ...override,
  };
}
async function upload(token, actorId, operations) {
  return (
    await request(app)
      .post("/api/sync/operations")
      .set(auth(token))
      .send({ actorId, operations })
      .expect(200)
  ).body.results;
}
async function examinerId() {
  return (await db.course.findUnique({ where: { id: courseId } })).examinerId;
}

test("prepared rosters are owned, bounded and omit all check-in secrets", async () => {
  const session = await freshClass();
  await request(app)
    .post("/api/sync/preparations")
    .set(auth(student))
    .send({ sessionId: session.id })
    .expect(403);
  await request(app)
    .post("/api/sync/preparations")
    .set(auth(other))
    .send({ sessionId: session.id })
    .expect(403);
  const bundle = await preparation(session);
  assert.equal(bundle.userId, await examinerId());
  assert.ok(
    Date.parse(bundle.expiresAt) - Date.parse(bundle.createdAt) <=
      72 * 3600000 + 1000,
  );
  assert.ok(!JSON.stringify(bundle).includes('"checkinSecret"'));
  assert.ok(!JSON.stringify(bundle).includes('"activeCode"'));
  assert.ok(bundle.roster.every((r) => !("passwordHash" in r.student)));
});

test("offline marks and receipts commit once under concurrent retries; IDs cannot change payload", async () => {
  const bundle = await preparation(await freshClass()),
    op = markOperation(bundle),
    actorId = await examinerId();
  const results = await Promise.all([
    upload(examiner, actorId, [op]),
    upload(examiner, actorId, [
      { ...op, operationId: op.operationId.toUpperCase() },
    ]),
  ]);
  assert.ok(results.every((r) => r[0].outcome === "ACCEPTED"));
  assert.equal(results.filter((r) => r[0].replayed).length, 1);
  assert.equal(
    await db.attendanceChange.count({ where: { operationId: op.operationId } }),
    1,
  );
  assert.equal(
    await db.syncReceipt.count({
      where: { actorId, operationId: op.operationId },
    }),
    1,
  );
  const [changed] = await upload(examiner, actorId, [
    { ...op, status: "ABSENT" },
  ]);
  assert.equal(changed.code, "OPERATION_ID_REUSED");
  assert.equal(
    (
      await db.attendance.findUnique({
        where: { studentId_sessionId: { studentId, sessionId: op.sessionId } },
      })
    ).status,
    "PRESENT",
  );
});

test("manual changes cause a conflict and an explicit current-version review can resolve it", async () => {
  const session = await freshClass(),
    bundle = await preparation(session),
    op = markOperation(bundle),
    actorId = await examinerId();
  await request(app)
    .post(`/api/examiner/sessions/${session.id}/attendance`)
    .set(auth(examiner))
    .send({ studentId, status: "ABSENT", reason: "Initial verified register" })
    .expect(200);
  const [conflict] = await upload(examiner, actorId, [op]);
  assert.equal(conflict.code, "ATTENDANCE_CHANGED");
  assert.equal(conflict.current.attendance.status, "ABSENT");
  assert.equal(
    await db.attendanceChange.count({ where: { operationId: op.operationId } }),
    0,
  );
  const latest = await preparation(session, "REVIEW");
  assert.ok(!JSON.stringify(latest).includes("Initial verified register"));
  assert.deepEqual(
    latest.roster.find((r) => r.student.id === studentId).attendance.changes,
    [],
  );
  const reviewed = markOperation(latest, {
    type: "REVIEW_MARK",
    reviewOf: op.operationId,
    reason: "Reviewed the saved observation with the current record",
  });
  const [accepted] = await upload(examiner, actorId, [reviewed]);
  assert.equal(accepted.outcome, "ACCEPTED");
  assert.equal(accepted.attendance.version, 2);
  const receipt = await db.syncReceipt.findUnique({
    where: { actorId_operationId: { actorId, operationId: op.operationId } },
  });
  assert.equal(receipt.result.outcome, "CONFLICT");
});

test("expiry, cancellation, finalization and enrollment changes never silently overwrite", async () => {
  const actorId = await examinerId();
  for (const change of [
    "expiry",
    "cancel",
    "complete",
    "enrollment",
    "policy",
  ]) {
    const session = await freshClass(),
      bundle = await preparation(session),
      op = markOperation(bundle);
    let restore;
    if (change === "expiry")
      await db.offlinePreparation.update({
        where: { id: bundle.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    if (change === "cancel" || change === "complete")
      await request(app)
        .post(`/api/examiner/sessions/${session.id}/${change}`)
        .set(auth(examiner))
        .expect(200);
    if (change === "enrollment") {
      const enrollment = await db.enrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId } },
      });
      await db.enrollment.delete({ where: { id: enrollment.id } });
      await db.enrollment.create({ data: { studentId, courseId } });
    }
    if (change === "policy") {
      const course = await db.course.findUnique({ where: { id: courseId } });
      await db.course.update({
        where: { id: courseId },
        data: {
          attendanceThreshold: course.attendanceThreshold === 75 ? 80 : 75,
        },
      });
      restore = () =>
        db.course.update({
          where: { id: courseId },
          data: { attendanceThreshold: course.attendanceThreshold },
        });
    }
    try {
      const [result] = await upload(examiner, actorId, [op]);
      assert.ok(
        ["CONFLICT", "DENIED", "NEEDS_REVIEW"].includes(result.outcome),
        change,
      );
      assert.equal(
        await db.attendance.count({ where: { sessionId: session.id } }),
        0,
        change,
      );
    } finally {
      if (restore) await restore();
    }
  }
});

test("sync rechecks ownership, current role, account status and originating identity", async () => {
  const session = await freshClass(),
    bundle = await preparation(session),
    op = markOperation(bundle),
    actorId = await examinerId();
  const otherId = (
    await db.user.findUnique({ where: { email: "other@test.example" } })
  ).id;
  await db.course.update({
    where: { id: courseId },
    data: { examinerId: otherId },
  });
  try {
    assert.equal(
      (await upload(examiner, actorId, [op]))[0].code,
      "OWNERSHIP_CHANGED",
    );
  } finally {
    await db.course.update({
      where: { id: courseId },
      data: { examinerId: actorId },
    });
  }
  await request(app)
    .post("/api/sync/operations")
    .set(auth(examiner))
    .send({ actorId: studentId, operations: [op] })
    .expect(403);
  await db.user.update({ where: { id: actorId }, data: { role: "STUDENT" } });
  try {
    assert.equal(
      (
        await upload(examiner, actorId, [{ ...op, operationId: randomUUID() }])
      )[0].code,
      "ROLE_CHANGED",
    );
  } finally {
    await db.user.update({
      where: { id: actorId },
      data: { role: "EXAMINER" },
    });
  }
  await db.user.update({ where: { id: actorId }, data: { isActive: false } });
  try {
    await request(app)
      .post("/api/sync/operations")
      .set(auth(examiner))
      .send({ actorId, operations: [op] })
      .expect(401);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "teacher@test.example", password: "TestPassword2026!" })
      .expect(401);
  } finally {
    await db.user.update({ where: { id: actorId }, data: { isActive: true } });
  }
});

test("independent operations return individual results and batch validation is strict", async () => {
  const bundle = await preparation(await freshClass()),
    actorId = await examinerId();
  const valid = markOperation(bundle),
    invalid = markOperation(bundle, {
      preparationId: "c0000000000000000000000000",
    });
  const results = await upload(examiner, actorId, [invalid, valid]);
  assert.equal(results[0].outcome, "DENIED");
  assert.equal(results[1].outcome, "ACCEPTED");
  await request(app)
    .post("/api/sync/operations")
    .set(auth(examiner))
    .send({ actorId, operations: [{ ...valid, operationId: "not-a-uuid" }] })
    .expect(400);
  await request(app)
    .post("/api/sync/operations")
    .set(auth(examiner))
    .send({ actorId, operations: Array(21).fill(valid) })
    .expect(400);
  await request(app)
    .post("/api/sync/operations")
    .set(auth(examiner))
    .send({ actorId, operations: [{ ...valid, untrustedOverride: true }] })
    .expect(400);
});

test("attendance, audit and receipt all roll back when the audit write fails", async () => {
  const bundle = await preparation(await freshClass()),
    actorId = await examinerId(),
    op = markOperation(bundle, { reason: "simulate audit failure" });
  await db.$executeRawUnsafe(
    "ALTER TABLE \"AttendanceChange\" ADD CONSTRAINT test_fail_sync_audit CHECK (reason <> 'simulate audit failure')",
  );
  try {
    await request(app)
      .post("/api/sync/operations")
      .set(auth(examiner))
      .send({ actorId, operations: [op] })
      .expect(500);
    assert.equal(
      await db.attendance.count({ where: { sessionId: op.sessionId } }),
      0,
    );
    assert.equal(
      await db.syncReceipt.count({
        where: { actorId, operationId: op.operationId },
      }),
      0,
    );
  } finally {
    await db.$executeRawUnsafe(
      'ALTER TABLE "AttendanceChange" DROP CONSTRAINT test_fail_sync_audit',
    );
  }
  assert.equal((await upload(examiner, actorId, [op]))[0].outcome, "ACCEPTED");
});

async function claimFor(session) {
  const op = {
    type: "STUDENT_CLAIM",
    operationId: randomUUID(),
    sessionId: session.id,
    observedAt: new Date().toISOString(),
    reason: "I attended but could not send my check-in",
  };
  const [result] = await upload(student, studentId, [op]);
  assert.equal(result.outcome, "ACCEPTED");
  return { op, claim: result.claim };
}
function decision(session, claim, overrides = {}) {
  return {
    type: "CLAIM_DECISION",
    operationId: randomUUID(),
    sessionId: session.id,
    studentId,
    claimId: claim.id,
    baseClaimVersion: claim.version,
    baseSessionVersion: session.version,
    baseAttendanceVersion: 0,
    decision: "APPROVE",
    status: "PRESENT",
    observedAt: new Date().toISOString(),
    reason: "Reviewed class observations and verified this request",
    ...overrides,
  };
}

test("student claims remain uncounted until one idempotent lecturer decision", async () => {
  const session = await freshClass(),
    { op, claim } = await claimFor(session),
    actorId = await examinerId();
  assert.equal((await upload(student, studentId, [op]))[0].replayed, true);
  assert.equal(
    await db.attendance.count({ where: { sessionId: session.id } }),
    0,
  );
  await request(app)
    .get(`/api/examiner/sessions/${session.id}/claims`)
    .set(auth(other))
    .expect(403);
  const approve = decision(session, claim);
  const [accepted] = await upload(examiner, actorId, [approve]);
  assert.equal(accepted.claim.status, "APPROVED");
  assert.equal(accepted.attendance.status, "PRESENT");
  assert.equal((await upload(examiner, actorId, [approve]))[0].replayed, true);
  assert.equal(
    await db.attendanceChange.count({
      where: { operationId: approve.operationId },
    }),
    1,
  );
  assert.equal(
    (
      await upload(examiner, actorId, [
        { ...approve, operationId: randomUUID(), decision: "REJECT" },
      ])
    )[0].code,
    "CLAIM_CHANGED",
  );
  const visible = await request(app)
    .get("/api/student/attendance-claims")
    .set(auth(student))
    .expect(200);
  assert.ok(
    visible.body.some((c) => c.id === claim.id && c.status === "APPROVED"),
  );
});

test("claim rejection changes no attendance and stale approvals require review", async () => {
  const actorId = await examinerId();
  const session = await freshClass(),
    { claim } = await claimFor(session);
  await request(app)
    .post(`/api/examiner/sessions/${session.id}/attendance`)
    .set(auth(examiner))
    .send({
      studentId,
      status: "ABSENT",
      reason: "Verified register before request review",
    })
    .expect(200);
  const [stale] = await upload(examiner, actorId, [decision(session, claim)]);
  assert.equal(stale.code, "REGISTER_CHANGED");
  const [rejected] = await upload(examiner, actorId, [
    decision(session, claim, { decision: "REJECT" }),
  ]);
  assert.equal(rejected.claim.status, "REJECTED");
  assert.equal(rejected.attendance.status, "ABSENT");
  const second = await freshClass(),
    pending = await claimFor(second);
  await request(app)
    .post(`/api/examiner/sessions/${second.id}/complete`)
    .set(auth(examiner))
    .expect(200);
  const completed = await db.session.findUnique({ where: { id: second.id } });
  const [approved] = await upload(examiner, actorId, [
    decision(completed, pending.claim),
  ]);
  assert.equal(approved.claim.status, "APPROVED");
});

async function timetableFixture() {
  const { kampalaDay } = await import("../src/services/rules.js");
  const from = new Date(Date.parse(kampalaDay() + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  const plus = (n) =>
    new Date(Date.parse(from) + n * 86400000).toISOString().slice(0, 10);
  const original = await db.course.findUnique({ where: { id: courseId } });
  const course = await db.course.create({
    data: {
      code: "TT" + randomUUID().slice(0, 8).toUpperCase(),
      title: "Timetable verification",
      program: "BSE",
      year: 2,
      semester: original.semester,
      academicYear: original.academicYear,
      examinerId: original.examinerId,
      enrollments: { create: { studentId } },
    },
  });
  let term = await db.academicTerm.findUnique({
    where: {
      academicYear_semester: {
        academicYear: course.academicYear,
        semester: course.semester,
      },
    },
  });
  if (!term)
    term = (
      await request(app)
        .post("/api/admin/timetable/terms")
        .set(auth(admin))
        .send({
          academicYear: course.academicYear,
          semester: course.semester,
          startsOn: from,
          endsOn: plus(89),
          excludedDates: [
            {
              date: plus(7),
              reason: "Synthetic non-teaching date for verification",
            },
          ],
          sourceUrl: "https://www.must.ac.ug/academic-calendar/",
          sourceNote: "Synthetic calendar in isolated verification database",
          reviewed: true,
        })
        .expect(201)
    ).body;
  const weekday = ((new Date(from).getUTCDay() + 6) % 7) + 1;
  const row = {
    natural_key: "fixture:" + course.code,
    program_group: "BSE II",
    course_code: course.code,
    course_title: course.title,
    day: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ][weekday - 1],
    start_time: "09:00",
    end_time: "11:00",
    time_slot: "09:00-10:00",
    room: "Teaching Room",
    lecturer: "Assigned lecturer",
    session_type: null,
    shared_with: [],
  };
  const publication = await db.timetablePublication.create({
    data: {
      source: "isolated-test",
      contentHash: randomUUID(),
      rows: [row],
      metadata: { academic_year: course.academicYear },
    },
  });
  const input = {
    publicationId: publication.id,
    sourceKey: row.natural_key,
    courseId: course.id,
    termId: term.id,
    weekday,
    startTime: "09:00",
    endTime: "11:00",
    room: "Teaching Room",
    sessionType: "LECTURE",
    from,
    to: plus(13),
    reviewed: true,
    reason: "Verified the synthetic source disagreement and teaching dates",
  };
  return { course, term, publication, input, from, plus };
}
const previewSchedule = async (input) =>
  (
    await request(app)
      .post("/api/admin/timetable/preview")
      .set(auth(admin))
      .send(input)
      .expect(201)
  ).body;
const applySchedule = async (id) =>
  (
    await request(app)
      .post(`/api/admin/timetable/reviews/${id}/apply`)
      .set(auth(admin))
      .expect(200)
  ).body;

test("actual weekly data and sourced calendar are available without inventing attendance classes", async () => {
  const before = await db.session.count();
  const ref = await request(app)
    .get("/api/timetable/reference?group=BSE%20II")
    .set(auth(student))
    .expect(200);
  assert.equal(ref.body.total, 1304);
  assert.ok(ref.body.rows.length > 0);
  assert.ok(
    ref.body.rows.every(
      (r) => r.program_group === "BSE II" || r.shared_with.includes("BSE II"),
    ),
  );
  assert.ok(
    ref.body.rows.some((r) => r.issues.includes("TIME_FIELDS_DISAGREE")),
  );
  assert.equal(await db.session.count(), before);
  const calendar = await request(app)
    .get("/api/timetable/calendar")
    .set(auth(student))
    .expect(200);
  assert.equal(calendar.body.reference.lecturesBegin, "2026-08-17");
  assert.equal(calendar.body.reference.semesterEnds, "2026-12-12");
  assert.ok(
    calendar.body.reference.events.some(
      (e) => e.date === "2026-10-29" && e.teachingClosureConfirmed === false,
    ),
  );
});

test("timetable preview writes no classes; apply respects exclusions and replays safely", async () => {
  const f = await timetableFixture(),
    preview = await previewSchedule(f.input);
  assert.equal(preview.summary.CREATE, 1);
  assert.equal(await db.session.count({ where: { courseId: f.course.id } }), 0);
  const applied = await applySchedule(preview.id);
  const rows = await db.session.findMany({ where: { courseId: f.course.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "SCHEDULED");
  assert.equal(rows[0].timetableDate.toISOString().slice(0, 10), f.from);
  assert.equal((await applySchedule(preview.id)).replayed, true);
  const repeated = await previewSchedule({
    ...f.input,
    entryId: applied.entryId,
  });
  assert.equal(repeated.summary.CREATE, 0);
  assert.equal(repeated.summary.UNCHANGED, 1);
  await applySchedule(repeated.id);
  assert.equal(await db.session.count({ where: { courseId: f.course.id } }), 1);
});

test("reviewed timetable edits preserve class IDs and protect attended/finalized records", async () => {
  const f = await timetableFixture(),
    first = await applySchedule((await previewSchedule(f.input)).id);
  const before = await db.session.findFirst({
    where: { courseId: f.course.id },
  });
  const changed = await previewSchedule({
    ...f.input,
    entryId: first.entryId,
    startTime: "10:00",
    endTime: "12:00",
  });
  assert.equal(changed.summary.UPDATE, 1);
  await applySchedule(changed.id);
  const after = await db.session.findFirst({
    where: { courseId: f.course.id },
  });
  assert.equal(after.id, before.id);
  assert.equal(after.version, 2);
  await db.attendance.create({
    data: {
      studentId,
      sessionId: after.id,
      status: "PRESENT",
      method: "MANUAL",
    },
  });
  const protectedPlan = await previewSchedule({
    ...f.input,
    entryId: first.entryId,
    startTime: "11:00",
    endTime: "13:00",
  });
  assert.equal(protectedPlan.summary.PROTECTED, 1);
  await applySchedule(protectedPlan.id);
  assert.equal(
    (
      await db.session.findUnique({ where: { id: after.id } })
    ).startTime.toISOString(),
    after.startTime.toISOString(),
  );
});

test("stale timetable reviews and overlapping manual classes cannot be applied", async () => {
  const f = await timetableFixture(),
    preview = await previewSchedule(f.input);
  const start = new Date(f.from + "T09:30:00+03:00"),
    end = new Date(f.from + "T10:30:00+03:00");
  await db.session.create({
    data: {
      courseId: f.course.id,
      naturalKey: "overlap:" + randomUUID(),
      startTime: start,
      endTime: end,
    },
  });
  await request(app)
    .post(`/api/admin/timetable/reviews/${preview.id}/apply`)
    .set(auth(admin))
    .expect(409);
  const blocked = await previewSchedule(f.input);
  assert.ok(blocked.blockers.length);
  await request(app)
    .post(`/api/admin/timetable/reviews/${blocked.id}/apply`)
    .set(auth(admin))
    .expect(409);
  await request(app)
    .post("/api/admin/timetable/preview")
    .set(auth(examiner))
    .send(f.input)
    .expect(403);
  await request(app)
    .post("/api/admin/timetable/preview")
    .set(auth(admin))
    .send({ ...f.input, from: "2026-02-31" })
    .expect(400);
});

test("failed source refresh preserves the saved publication and records useful failure status", async () => {
  const before = await db.timetablePublication.count(),
    previous = globalThis.fetch;
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
  try {
    await request(app)
      .post("/api/admin/timetable/refresh")
      .set(auth(admin))
      .send({ source: "mylectures" })
      .expect(503);
  } finally {
    globalThis.fetch = previous;
  }
  assert.equal(await db.timetablePublication.count(), before);
  assert.ok(
    await db.auditEvent.count({
      where: { kind: "TIMETABLE_SOURCE_FAILURE", entityId: "mylectures" },
    }),
  );
  await request(app)
    .post("/api/admin/timetable/refresh")
    .set(auth(student))
    .send({ source: "mylectures" })
    .expect(403);
});

test("late enrollment and withdrawal change per-student denominators without deleting history", async () => {
  const { kampalaDay } = await import("../src/services/rules.js");
  const today = kampalaDay(),
    date = (n) =>
      new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
  const owner = await examinerId();
  const course = await db.course.create({
    data: {
      code: "DATES" + randomUUID().slice(0, 5),
      title: "Enrollment date verification",
      academicYear: "2026/2027",
      semester: 1,
      program: "BSE",
      year: 2,
      examinerId: owner,
      enrollments: { create: { studentId } },
    },
  });
  const enrollment = await db.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId: course.id } },
  });
  const sessions = [];
  for (const n of [-2, -1, 0]) {
    const s = await db.session.create({
      data: {
        courseId: course.id,
        naturalKey: "dated:" + randomUUID(),
        startTime: new Date(date(n) + "T09:00:00+03:00"),
        endTime: new Date(date(n) + "T11:00:00+03:00"),
        status: "COMPLETED",
      },
    });
    sessions.push(s);
    await db.attendance.create({
      data: { studentId, sessionId: s.id, status: "PRESENT" },
    });
  }
  await request(app)
    .patch(`/api/admin/enrollments/${enrollment.id}`)
    .set(auth(admin))
    .send({
      effectiveFrom: date(-1),
      effectiveUntil: today,
      reason: "Verified actual enrollment and withdrawal dates",
    })
    .expect(200);
  const report = await request(app)
    .get(`/api/admin/eligibility/${course.id}`)
    .set(auth(admin))
    .expect(200);
  assert.equal(report.body.students[0].totalSessions, 1);
  assert.equal(report.body.students[0].presentCount, 1);
  assert.equal(
    await db.attendance.count({
      where: { sessionId: { in: sessions.map((s) => s.id) } },
    }),
    3,
  );
  const schedule = await request(app)
    .get(`/api/timetable/sessions?from=${date(-2)}&to=${today}`)
    .set(auth(student))
    .expect(200);
  assert.equal(schedule.body.filter((s) => s.courseId === course.id).length, 1);
  assert.ok(schedule.body.every((s) => !("enrollments" in s.course)));
  await request(app)
    .post(`/api/examiner/sessions/${sessions[0].id}/attendance`)
    .set(auth(examiner))
    .send({
      studentId,
      status: "PRESENT",
      reason: "This class predates enrollment",
    })
    .expect(400);
});

test("saved report snapshots retain old policy and counts after audited policy changes", async () => {
  const course = await db.course.create({
    data: {
      code: "POL" + randomUUID().slice(0, 6),
      title: "Policy snapshot verification",
      academicYear: "2026/2027",
      semester: 1,
      program: "BSE",
      year: 2,
      examinerId: await examinerId(),
      attendanceThreshold: 60,
      enrollments: { create: { studentId } },
    },
  });
  for (const status of ["LATE", "LATE", "EXCUSED"]) {
    await db.session.create({
      data: {
        courseId: course.id,
        naturalKey: "policy:" + randomUUID(),
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() - 1800000),
        status: "COMPLETED",
        attendances: { create: { studentId, status, method: "MANUAL" } },
      },
    });
  }
  const snapshot = await request(app)
    .post(`/api/reports/courses/${course.id}/snapshots`)
    .set(auth(examiner))
    .send({
      reason: "Issued after checking the register and device sync",
      reviewedPendingWork: true,
      basePolicyVersion: 1,
    })
    .expect(201);
  assert.equal(snapshot.body.data.students[0].presentCount, 2);
  assert.equal(snapshot.body.data.course.countLate, true);
  await request(app)
    .patch(`/api/admin/courses/${course.id}/policy`)
    .set(auth(admin))
    .send({
      attendanceThreshold: 60,
      countLate: false,
      countExcused: true,
      basePolicyVersion: 1,
      reason: "Reviewed a different explicitly configured rule",
    })
    .expect(200);
  const live = await request(app)
    .get(`/api/admin/eligibility/${course.id}`)
    .set(auth(admin))
    .expect(200);
  assert.equal(live.body.students[0].presentCount, 1);
  assert.equal(live.body.course.policyVersion, 2);
  const frozen = await request(app)
    .get(`/api/reports/snapshots/${snapshot.body.id}`)
    .set(auth(examiner))
    .expect(200);
  assert.equal(frozen.body.data.students[0].presentCount, 2);
  assert.equal(frozen.body.contentHash, snapshot.body.contentHash);
  await request(app)
    .get(`/api/reports/snapshots/${snapshot.body.id}`)
    .set(auth(other))
    .expect(403);
  await request(app)
    .get(`/api/reports/snapshots/${snapshot.body.id}/pdf`)
    .set(auth(examiner))
    .expect(200)
    .expect("Content-Type", /application\/pdf/);
});

test("catalogued registration derives the institutional email and supports password-protected registration sign-in", async () => {
  const created = await request(app)
    .post("/api/admin/users")
    .set(auth(admin))
    .send({
      name: "Profile Verification Learner",
      regNo: "2025/BSE/88001/PS",
      password: "TestPassword2026!",
      role: "STUDENT",
      programmeCode: "BSE",
      year: 2,
      studyGroupKey: "BSE II",
      studyAcademicYear: "2026/2027",
      studySemester: 1,
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.email, "2025bse88001@sdt.must.ac.ug");
  assert.equal("passwordHash" in created.body, false);
  const signed = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "2025/bse/88001/ps", password: "TestPassword2026!" });
  assert.equal(signed.status, 200);
  assert.equal(signed.body.user.studyGroupKey, "BSE II");
  const denied = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "2025/BSE/88001/PS", password: "wrong" });
  assert.equal(denied.status, 401);
  const day = await request(app)
    .get("/api/student/day")
    .set(auth(signed.body.accessToken));
  assert.equal(day.status, 200);
  assert.equal(day.body.profile.programme.faculty.code, "computing");
  assert.equal(day.body.classes.length, 0);
  assert.ok(day.body.weekly.events.length > 0);
  assert.ok(
    day.body.weekly.events.every(
      (e) => e.kind === "REFERENCE" && !("activeCode" in e),
    ),
  );
  const scoped = await request(app)
    .get("/api/timetable/reference?group=BIT%20I")
    .set(auth(signed.body.accessToken));
  assert.equal(scoped.status, 200);
  assert.deepEqual(scoped.body.groups, ["BSE II"]);
});
test("registrar programme filters include explicit shared audiences and exclude unrelated faculties", async () => {
  const shared = await request(app)
    .post("/api/admin/courses")
    .set(auth(admin))
    .send({
      code: "SHARED8801",
      title: "Shared teaching audience verification",
      program: "BSE",
      year: 2,
      academicYear: "2026/2027",
      semester: 1,
      examinerId: (await db.course.findUnique({ where: { id: courseId } }))
        .examinerId,
      audienceGroups: ["BSE II", "BCS II"],
    });
  assert.equal(shared.status, 201, JSON.stringify(shared.body));
  const computing = await request(app)
    .get("/api/admin/courses?faculty=computing&programme=BCS")
    .set(auth(admin));
  assert.equal(computing.status, 200);
  assert.ok(computing.body.some((c) => c.id === shared.body.id));
  const business = await request(app)
    .get("/api/admin/courses?faculty=business")
    .set(auth(admin));
  assert.equal(business.status, 200);
  assert.equal(
    business.body.some((c) => c.id === shared.body.id),
    false,
  );
  const people = await request(app)
    .get(
      "/api/admin/students?faculty=computing&programme=BSE&year=2&search=88001",
    )
    .set(auth(admin));
  assert.equal(people.status, 200);
  assert.equal(people.body.length, 1);
  assert.equal("passwordHash" in people.body[0], false);
  assert.equal(
    (
      await request(app)
        .get("/api/admin/students?programme=BSE")
        .set(auth(student))
    ).status,
    403,
  );
  assert.equal(
    (await request(app).get("/api/admin/courses?limit=999").set(auth(admin)))
      .status,
    400,
  );
});
test("placement correction preserves enrollment history and cannot silently change a registration programme", async () => {
  const learner = await db.user.findUniqueOrThrow({
    where: { regNo: "2025/BSE/88001/PS" },
  });
  const enrollment = await db.enrollment.create({
    data: { studentId: learner.id, courseId },
  });
  const input = {
    programmeCode: "BSE",
    year: 1,
    studyGroupKey: "BSE I",
    studyAcademicYear: "2026/2027",
    studySemester: 1,
    reason: "Confirmed repeat-year placement for verification",
  };
  assert.equal(
    (
      await request(app)
        .patch(`/api/admin/students/${learner.id}/profile`)
        .set(auth(admin))
        .send(input)
    ).status,
    200,
  );
  assert.equal(
    (await db.enrollment.findUnique({ where: { id: enrollment.id } })).courseId,
    courseId,
  );
  assert.equal(
    (await db.user.findUnique({ where: { id: learner.id } })).year,
    1,
  );
  assert.equal(
    (
      await request(app)
        .patch(`/api/admin/students/${learner.id}/profile`)
        .set(auth(admin))
        .send({ ...input, programmeCode: "BIT", studyGroupKey: "BIT I" })
    ).status,
    400,
  );
  const audit = await db.auditEvent.findFirst({
    where: { entityId: learner.id, kind: "ACADEMIC_PROFILE_CHANGED" },
  });
  assert.ok(audit);
  assert.equal("passwordHash" in audit.before, false);
});
test("registration preview distinguishes intake, sequence, sponsorship and programme duration", async () => {
  const preview = await request(app)
    .get(
      "/api/admin/registration/preview?regNo=2026%2FBSE%2F080%2FPS&academicYear=2026%2F2027",
    )
    .set(auth(admin));
  assert.equal(preview.status, 200);
  assert.equal(preview.body.suggestedYear, 1);
  assert.equal(preview.body.sequence, "080");
  assert.equal(preview.body.programme.faculty.code, "computing");
  assert.equal(
    (
      await request(app)
        .get(
          "/api/admin/registration/preview?regNo=bad&academicYear=2026%2F2027",
        )
        .set(auth(admin))
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .get(
          "/api/admin/registration/preview?regNo=2025%2FBSE%2F108%2FPS&academicYear=2026%2F2027",
        )
        .set(auth(student))
    ).status,
    403,
  );
  const invalid = await request(app)
    .post("/api/admin/users")
    .set(auth(admin))
    .send({
      name: "Invalid programme verification",
      regNo: "2025/BSE/88002/PS",
      password: "TestPassword2026!",
      role: "STUDENT",
      programmeCode: "BIT",
      year: 2,
      studyGroupKey: "BIT II",
    });
  assert.equal(invalid.status, 400);
});
test("out-of-audience enrollment requires a recorded exception instead of silently mixing programmes", async () => {
  const studentRes = await request(app)
    .post("/api/admin/users")
    .set(auth(admin))
    .send({
      name: "Audience exception learner",
      regNo: "2025/BME/88003/PS",
      password: "TestPassword2026!",
      role: "STUDENT",
      programmeCode: "BME",
      year: 2,
      studyGroupKey: "BME II",
      studyAcademicYear: "2026/2027",
      studySemester: 1,
    });
  assert.equal(studentRes.status, 201);
  const shared = await db.course.findFirstOrThrow({
      where: { code: "SHARED8801" },
    }),
    path = `/api/admin/courses/${shared.id}/enroll`;
  assert.equal(
    (
      await request(app)
        .post(path)
        .set(auth(admin))
        .send({ studentId: studentRes.body.id })
    ).status,
    400,
  );
  const allowed = await request(app).post(path).set(auth(admin)).send({
    studentId: studentRes.body.id,
    overrideReason: "Verified approved cross-programme elective",
  });
  assert.equal(allowed.status, 201);
  assert.ok(
    await db.auditEvent.findFirst({
      where: {
        entityId: allowed.body.id,
        reason: "Verified approved cross-programme elective",
      },
    }),
  );
});

// Account lifecycle cases use separate identities so existing attendance fixtures stay intact.
async function lifecycleUser(role = "STUDENT") {
  return db.user.create({
    data: {
      name: "Lifecycle Test User",
      email: `${randomUUID()}@lifecycle.test`,
      role,
      passwordHash: await bcrypt.hash("TestPassword2026!", 4),
    },
  });
}
async function signLifecycle(user, password = "TestPassword2026!") {
  return request(app)
    .post("/api/auth/login")
    .send({ email: user.email, password });
}
const management = (reason = "Verified in person for account recovery") => ({
  currentPassword: "TestPassword2026!",
  reason,
});

test("password changes validate the old password, enforce byte limits and revoke both token types", async () => {
  const user = await lifecycleUser();
  const signed = (await signLifecycle(user)).body;
  const route = "/api/auth/password";
  for (const [body, status] of [
    [
      { currentPassword: "incorrect", newPassword: "UpdatedPassword2026!" },
      401,
    ],
    [{ currentPassword: "TestPassword2026!", newPassword: "short" }, 400],
    [
      { currentPassword: "TestPassword2026!", newPassword: "😀".repeat(20) },
      400,
    ],
    [
      {
        currentPassword: "TestPassword2026!",
        newPassword: "TestPassword2026!",
      },
      400,
    ],
  ])
    assert.equal(
      (await request(app).post(route).set(auth(signed.accessToken)).send(body))
        .status,
      status,
    );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).authVersion,
    0,
  );
  const changed = await request(app)
    .post(route)
    .set(auth(signed.accessToken))
    .send({
      currentPassword: "TestPassword2026!",
      newPassword: "UpdatedPassword2026!",
    });
  assert.equal(changed.status, 200);
  assert.equal(
    (await request(app).get("/api/auth/me").set(auth(signed.accessToken)))
      .status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: signed.refreshToken })
    ).status,
    401,
  );
  assert.equal((await signLifecycle(user)).status, 401);
  assert.equal((await signLifecycle(user, "UpdatedPassword2026!")).status, 200);
  const events = await db.auditEvent.findMany({ where: { entityId: user.id } });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "PASSWORD_CHANGED");
  assert.ok(!JSON.stringify(events).includes("UpdatedPassword"));
  assert.ok(!JSON.stringify(events).includes("passwordHash"));
});

test("ending all sign-ins is persistent and requires the account owner's password", async () => {
  const user = await lifecycleUser("EXAMINER");
  const first = (await signLifecycle(user)).body,
    second = (await signLifecycle(user)).body;
  const result = await request(app)
    .post("/api/auth/end-signins")
    .set(auth(first.accessToken))
    .send({ currentPassword: "TestPassword2026!" });
  assert.equal(result.status, 200);
  for (const session of [first, second]) {
    assert.equal(
      (await request(app).get("/api/auth/me").set(auth(session.accessToken)))
        .status,
      401,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/auth/refresh")
          .send({ refreshToken: session.refreshToken })
      ).status,
      401,
    );
  }
  assert.equal((await signLifecycle(user)).status, 200);
});

test("registrar recovery requires reauthentication and a reason and protects registrar accounts", async () => {
  const user = await lifecycleUser();
  assert.equal(
    (await request(app).get("/api/admin/accounts").set(auth(student))).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post(`/api/admin/accounts/${user.id}/reset-password`)
        .set(auth(student))
        .send({ ...management(), temporaryPassword: "TemporaryPassword2026!" })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post(`/api/admin/accounts/${user.id}/reset-password`)
        .set(auth(admin))
        .send({
          ...management(),
          currentPassword: "wrong",
          temporaryPassword: "TemporaryPassword2026!",
        })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .patch(`/api/admin/accounts/${user.id}/status`)
        .set(auth(admin))
        .send({ currentPassword: "TestPassword2026!", isActive: false })
    ).status,
    400,
  );
  const administrator = await db.user.findUniqueOrThrow({
    where: { email: "admin@test.example" },
  });
  assert.equal(
    (
      await request(app)
        .patch(`/api/admin/accounts/${administrator.id}/status`)
        .set(auth(admin))
        .send({ ...management(), isActive: false })
    ).status,
    403,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).authVersion,
    0,
  );
});

test("disable and re-enable never resurrect old access or refresh tokens", async () => {
  const user = await lifecycleUser();
  const old = (await signLifecycle(user)).body;
  const url = `/api/admin/accounts/${user.id}/status`;
  for (const isActive of [false, true]) {
    const response = await request(app)
      .patch(url)
      .set(auth(admin))
      .send({ ...management(), isActive });
    assert.equal(response.status, 200);
    assert.equal(response.body.isActive, isActive);
    assert.equal(response.body.passwordHash, undefined);
    assert.equal(response.body.authVersion, undefined);
    assert.equal(
      (await request(app).get("/api/auth/me").set(auth(old.accessToken)))
        .status,
      401,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/auth/refresh")
          .send({ refreshToken: old.refreshToken })
      ).status,
      401,
    );
    assert.equal((await signLifecycle(user)).status, isActive ? 200 : 401);
  }
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).authVersion,
    2,
  );
  assert.equal(await db.auditEvent.count({ where: { entityId: user.id } }), 2);
});

test("temporary-password recovery restricts the workspace until the owner changes it", async () => {
  const user = await lifecycleUser();
  const old = (await signLifecycle(user)).body;
  const reset = await request(app)
    .post(`/api/admin/accounts/${user.id}/reset-password`)
    .set(auth(admin))
    .send({ ...management(), temporaryPassword: "TemporaryPassword2026!" });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.mustChangePassword, true);
  assert.equal(reset.body.temporaryPassword, undefined);
  assert.equal(
    (await request(app).get("/api/auth/me").set(auth(old.accessToken))).status,
    401,
  );
  const temporary = (await signLifecycle(user, "TemporaryPassword2026!")).body;
  assert.equal(temporary.user.mustChangePassword, true);
  const denied = await request(app)
    .get("/api/student/sessions/upcoming")
    .set(auth(temporary.accessToken));
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, "PASSWORD_CHANGE_REQUIRED");
  assert.equal(
    (await request(app).get("/api/auth/me").set(auth(temporary.accessToken)))
      .status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/password")
        .set(auth(temporary.accessToken))
        .send({
          currentPassword: "TemporaryPassword2026!",
          newPassword: "PermanentPassword2026!",
        })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: temporary.refreshToken })
    ).status,
    401,
  );
  const permanent = (await signLifecycle(user, "PermanentPassword2026!")).body;
  assert.equal(permanent.user.mustChangePassword, false);
  assert.equal(
    (
      await request(app)
        .get("/api/student/sessions/upcoming")
        .set(auth(permanent.accessToken))
    ).status,
    200,
  );
});

test("account lists are bounded, role-filtered and contain no credentials", async () => {
  const response = await request(app)
    .get("/api/admin/accounts?role=STUDENT&search=Lifecycle&limit=2")
    .set(auth(admin));
  assert.equal(response.status, 200);
  assert.equal(response.body.length, 2);
  assert.ok(response.body.every((u) => u.role === "STUDENT"));
  assert.ok(
    response.body.every((u) => !("passwordHash" in u) && !("authVersion" in u)),
  );
  assert.equal(
    (await request(app).get("/api/admin/accounts?limit=201").set(auth(admin)))
      .status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .get("/api/admin/accounts?active=invalid")
        .set(auth(admin))
    ).status,
    400,
  );
});

test("concurrent password changes cannot overwrite a newer credential", async () => {
  const user = await lifecycleUser();
  const signed = (await signLifecycle(user)).body;
  const results = await Promise.all(
    ["ConcurrentPasswordOne!", "ConcurrentPasswordTwo!"].map((newPassword) =>
      request(app)
        .post("/api/auth/password")
        .set(auth(signed.accessToken))
        .send({ currentPassword: "TestPassword2026!", newPassword }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.some((r) => [401, 409].includes(r.status)));
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).authVersion,
    1,
  );
});

test("published programme plans automate compulsory enrollment, constrain electives and preserve withdrawals", async () => {
  const year = new Date().getUTCFullYear(),
    academicYear = `${year}/${year + 1}`;
  const startsOn = new Date(Date.now() - 86400000 * 2),
    endsOn = new Date(Date.now() + 86400000 * 20);
  // Earlier timetable tests use future terms; this fixture supplies a current one.
  const existingTerms = await db.academicTerm.findMany();
  for (const t of existingTerms)
    await db.academicTerm.update({
      where: { id: t.id },
      data: {
        startsOn: new Date(Date.now() + 86400000 * 90),
        endsOn: new Date(Date.now() + 86400000 * 100),
      },
    });
  const term = await db.academicTerm.create({
    data: {
      academicYear: `${year + 10}/${year + 11}`,
      semester: 2,
      startsOn,
      endsOn,
      excludedDates: [],
      sourceUrl: "https://example.test/approved",
      sourceNote: "Isolated course-plan test",
    },
  });
  // Use an independent academic year to avoid pre-existing timetable term uniqueness.
  const intake = year + 9;
  const teacher = await db.user.findUniqueOrThrow({
    where: { email: "teacher@test.example" },
  });
  const adminUser = await db.user.findUniqueOrThrow({
    where: { email: "admin@test.example" },
  });
  const passwordHash = await bcrypt.hash("TestPassword2026!", 4);
  const learner = await db.user.create({
    data: {
      name: "Course Plan Learner",
      email: "plan-learner@test.example",
      regNo: `${intake}/BCS/9001/PS`,
      programmeCode: "BCS",
      role: "STUDENT",
      passwordHash,
    },
  });
  const peer = await db.user.create({
    data: {
      name: "Course Plan Peer",
      email: "plan-peer@test.example",
      regNo: `${intake}/BCS/9002/PS`,
      programmeCode: "BCS",
      role: "STUDENT",
      passwordHash,
    },
  });
  const outsider = await db.user.create({
    data: {
      name: "Other Programme",
      email: "plan-other@test.example",
      regNo: `${intake}/BSE/9003/PS`,
      programmeCode: "BSE",
      role: "STUDENT",
      passwordHash,
    },
  });
  const createCourse = async (code, group = "BCS II", isPractice = false) =>
    db.course.create({
      data: {
        code,
        title: code + " Course",
        academicYear: term.academicYear,
        semester: 2,
        program: group.split(" ")[0],
        programmeCode: group.split(" ")[0],
        year: 2,
        examinerId: teacher.id,
        isPractice,
        audiences: { create: { groupKey: group } },
      },
    });
  const required = await createCourse("PLANREQ"),
    elective = await createCourse("PLANELEC"),
    otherCourse = await createCourse("PLANOTHER", "BSE II"),
    practice = await createCourse("PLAN-P");
  const adminToken = await login(adminUser.email);
  const headers = auth(adminToken);
  const input = {
    termId: term.id,
    groupKey: "BCS II",
    expectedVersion: 0,
    reason: "Publish approved test curriculum",
    items: [
      { courseId: required.id, compulsory: true },
      { courseId: elective.id, compulsory: false },
    ],
  };
  let plan;
  try {
    assert.equal(
      (
        await request(app)
          .post("/api/admin/course-plans/preview")
          .set(headers)
          .send({
            ...input,
            items: [{ courseId: otherCourse.id, compulsory: true }],
          })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/admin/course-plans/preview")
          .set(headers)
          .send({
            ...input,
            items: [{ courseId: practice.id, compulsory: true }],
          })
      ).status,
      400,
    );
    const preview = await request(app)
      .post("/api/admin/course-plans/preview")
      .set(headers)
      .send(input);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const bad = await request(app)
      .post("/api/admin/course-plans/publish")
      .set(headers)
      .send({
        ...input,
        previewHash: preview.body.previewHash,
        currentPassword: "incorrect",
      });
    assert.equal(bad.status, 401);
    const published = await request(app)
      .post("/api/admin/course-plans/publish")
      .set(headers)
      .send({
        ...input,
        previewHash: preview.body.previewHash,
        currentPassword: "TestPassword2026!",
      });
    assert.equal(published.status, 201, JSON.stringify(published.body));
    plan = published.body;
    assert.equal(
      await db.enrollment.count({ where: { studentId: learner.id } }),
      0,
    );
    const studentToken = await login(learner.email);
    let enrollments = await db.enrollment.findMany({
      where: { studentId: learner.id },
    });
    assert.equal(enrollments.length, 1);
    assert.equal(enrollments[0].courseId, required.id);
    assert.equal(enrollments[0].origin, "COURSE_PLAN");
    const { kampalaDay } = await import("../src/services/rules.js");
    assert.equal(
      enrollments[0].effectiveFrom.toISOString().slice(0, 10),
      kampalaDay(),
    );
    const learnerProfile = await db.user.findUnique({
      where: { id: learner.id },
    });
    assert.equal(learnerProfile.studyGroupKey, "BCS II");
    await Promise.all([login(learner.email), login(learner.email)]);
    assert.equal(
      await db.enrollment.count({ where: { studentId: learner.id } }),
      1,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/admin/course-plans/preview")
          .set(auth(studentToken))
          .send(input)
      ).status,
      403,
    );
    const body = {
      confirm: true,
      planId: plan.id,
      version: plan.version,
      electives: [elective.id],
    };
    assert.equal(
      (
        await request(app)
          .post("/api/student/course-setup")
          .set(auth(studentToken))
          .send({ ...body, electives: [otherCourse.id] })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/student/course-setup")
          .set(auth(studentToken))
          .send({ ...body, version: 99 })
      ).status,
      409,
    );
    const confirmed = await request(app)
      .post("/api/student/course-setup")
      .set(auth(studentToken))
      .send(body);
    assert.equal(confirmed.status, 200);
    assert.ok(confirmed.body.confirmedAt);
    assert.equal(confirmed.body.courses.filter((c) => c.enrolled).length, 2);
    const withdrawnAt = new Date(Date.now() - 86400000);
    withdrawnAt.setUTCHours(0, 0, 0, 0);
    await db.enrollment.update({
      where: { id: enrollments[0].id },
      data: { effectiveUntil: withdrawnAt },
    });
    const reloaded = await request(app)
      .post("/api/student/course-setup")
      .set(auth(studentToken))
      .send({});
    assert.equal(reloaded.status, 200);
    assert.equal(
      reloaded.body.courses.find((c) => c.id === required.id).enrolled,
      false,
    );
    await login(learner.email);
    assert.equal(
      (
        await db.enrollment.findUnique({ where: { id: enrollments[0].id } })
      ).effectiveUntil.getTime(),
      withdrawnAt.getTime(),
    );
    const outsideToken = await login(outsider.email);
    const pending = await request(app)
      .post("/api/student/course-setup")
      .set(auth(outsideToken))
      .send({});
    assert.equal(pending.body.status, "PLAN_PENDING");
    assert.equal(
      await db.enrollment.count({ where: { studentId: outsider.id } }),
      0,
    );
    const batch = await request(app)
      .post("/api/admin/course-plans/batch-preview")
      .set(headers)
      .send({ planId: plan.id });
    assert.equal(batch.status, 200, JSON.stringify(batch.body));
    assert.equal(batch.body.rows.length, 2);
    assert.ok(batch.body.rows.find((r) => r.id === peer.id).newCourses === 1);
    const applied = await request(app)
      .post("/api/admin/course-plans/batch-apply")
      .set(headers)
      .send({
        planId: plan.id,
        previewHash: batch.body.previewHash,
        currentPassword: "TestPassword2026!",
        reason: "Assign reviewed cohort courses",
      });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.inserted, 1);
    const stale = await request(app)
      .post("/api/admin/course-plans/batch-apply")
      .set(headers)
      .send({
        planId: plan.id,
        previewHash: batch.body.previewHash,
        currentPassword: "TestPassword2026!",
        reason: "Retry stale cohort preview",
      });
    assert.equal(stale.status, 409);
    const auditEvents = await db.auditEvent.findMany({
      where: {
        kind: "COURSE_PLAN_ENROLLMENT",
        entityId: {
          in: (
            await db.enrollment.findMany({
              where: { studentId: { in: [learner.id, peer.id] } },
            })
          ).map((e) => e.id),
        },
      },
    });
    assert.equal(auditEvents.length, 3);
    assert.ok(!JSON.stringify(auditEvents).includes("TestPassword2026!"));
  } finally {
    await db.studentCourseSetup.deleteMany({
      where: { studentId: { in: [learner.id, peer.id, outsider.id] } },
    });
    if (plan) {
      await db.coursePlanItem.deleteMany({ where: { planId: plan.id } });
      await db.coursePlan.delete({ where: { id: plan.id } });
    }
    await db.enrollment.deleteMany({
      where: { studentId: { in: [learner.id, peer.id, outsider.id] } },
    });
    await db.courseAudience.deleteMany({
      where: {
        courseId: {
          in: [required.id, elective.id, otherCourse.id, practice.id],
        },
      },
    });
    await db.course.deleteMany({
      where: {
        id: { in: [required.id, elective.id, otherCourse.id, practice.id] },
      },
    });
    await db.user.deleteMany({
      where: { id: { in: [learner.id, peer.id, outsider.id] } },
    });
    await db.academicTerm.delete({ where: { id: term.id } });
    for (const t of existingTerms)
      await db.academicTerm.update({
        where: { id: t.id },
        data: { startsOn: t.startsOn, endsOn: t.endsOn },
      });
  }
});

test("report enrollment boundaries use Kampala dates independently of the PostgreSQL session timezone", async () => {
  const teacher = await db.user.findUniqueOrThrow({
    where: { email: "teacher@test.example" },
  });
  const c = await db.course.create({
    data: {
      code: "EAT" + randomUUID().slice(0, 6),
      title: "Kampala midnight boundary",
      program: "BSE",
      year: 2,
      academicYear: "2026/2027",
      semester: 1,
      examinerId: teacher.id,
      enrollments: {
        create: {
          studentId,
          effectiveFrom: new Date("2026-11-13T00:00:00Z"),
          effectiveUntil: new Date("2026-11-14T00:00:00Z"),
        },
      },
    },
  });
  try {
    for (const instant of [
      "2026-11-12T20:30:00Z",
      "2026-11-12T22:00:00Z",
      "2026-11-13T22:00:00Z",
    ])
      await db.session.create({
        data: {
          courseId: c.id,
          naturalKey: "eat:" + randomUUID(),
          startTime: new Date(instant),
          endTime: new Date(Date.parse(instant) + 1800000),
          status: "COMPLETED",
        },
      });
    const { courseReport, getStudentAttendanceSummary } = await import(
      "../src/services/eligibility.js"
    );
    for (const tz of ["UTC", "Africa/Kampala", "America/New_York"]) {
      const report = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone',${tz},true)`;
        return courseReport(tx, c.id);
      });
      assert.equal(report.students[0].totalSessions, 1, tz);
    }
    const summary = await getStudentAttendanceSummary(studentId);
    assert.equal(summary.find((r) => r.courseId === c.id).totalSessions, 1);
  } finally {
    await db.session.deleteMany({ where: { courseId: c.id } });
    await db.enrollment.deleteMany({ where: { courseId: c.id } });
    await db.course.delete({ where: { id: c.id } });
  }
});

test("code windows and accepted submissions are audited without plaintext codes or secrets", async () => {
  const teacher = await db.user.findUniqueOrThrow({
    where: { email: "teacher@test.example" },
  });
  const c = await db.course.create({
    data: {
      code: "AUD" + randomUUID().slice(0, 6),
      title: "Window audit verification",
      program: "BSE",
      year: 2,
      academicYear: "2026/2027",
      semester: 1,
      examinerId: teacher.id,
      enrollments: { create: { studentId } },
    },
  });
  const s = await db.session.create({
    data: {
      courseId: c.id,
      naturalKey: "audit:" + randomUUID(),
      startTime: new Date(Date.now() - 60000),
      endTime: new Date(Date.now() + 3600000),
    },
  });
  const actor = { userId: teacher.id, role: "EXAMINER" };
  const { manageSession, submitCheckin } = await import(
    "../src/services/attendance.js"
  );
  try {
    const code = await manageSession(actor, s.id, "start");
    await manageSession(actor, s.id, "start");
    assert.equal(
      await db.auditEvent.count({
        where: { entityId: s.id, kind: "CHECKIN_WINDOW_OPEN" },
      }),
      1,
    );
    const first = await submitCheckin(studentId, s.id, code.code);
    await submitCheckin(studentId, s.id, code.code);
    await manageSession(actor, s.id, "stop");
    const events = await db.auditEvent.findMany({
      where: { entityId: { in: [s.id, first.attendance.id] } },
    });
    assert.deepEqual(events.map((e) => e.kind).sort(), [
      "CHECKIN_WINDOW_CLOSE",
      "CHECKIN_WINDOW_OPEN",
      "CODE_ATTENDANCE_RECORDED",
    ]);
    const saved = JSON.stringify(events);
    assert.ok(!saved.includes(code.code));
    assert.ok(!saved.includes("checkinSecret"));
  } finally {
    await db.attendance.deleteMany({ where: { sessionId: s.id } });
    await db.enrollment.deleteMany({ where: { courseId: c.id } });
    await db.session.delete({ where: { id: s.id } });
    await db.course.delete({ where: { id: c.id } });
  }
});
