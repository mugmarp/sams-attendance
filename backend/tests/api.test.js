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
  await db.syncReceipt.deleteMany();
  await db.offlinePreparation.deleteMany();
  await db.attendanceClaim.deleteMany();
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
