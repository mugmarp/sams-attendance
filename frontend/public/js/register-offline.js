import { api, captureSession, sameSession, retryable } from "./api.js";
import { operation, modify, withLease } from "./offline.js";
const changed = () => dispatchEvent(new Event("sams:operations"));
export async function savedRegisters(userId) {
  return (await operation("registers", "readonly", (s) => s.getAll())).filter(
    (r) => r.userId === userId,
  );
}
export async function savedRegister(userId, sessionId) {
  captureSession(userId);
  return operation("registers", "readonly", (s) =>
    s.get(userId + ":" + sessionId),
  );
}
export async function prepare(userId, sessionId, purpose = "MARK") {
  const session = captureSession(userId);
  const bundle = await api("/sync/preparations", {
    method: "POST",
    session,
    body: { sessionId, purpose },
  });
  if (purpose === "MARK" && sameSession(session)) {
    await operation("registers", "readwrite", (s) =>
      s.put({
        ...bundle,
        preparationId: bundle.id,
        id: userId + ":" + sessionId,
      }),
    );
    changed();
  }
  return { ...bundle, preparationId: bundle.id };
}
export async function operations(userId, sessionId) {
  return (await operation("operations", "readonly", (s) => s.getAll()))
    .filter(
      (op) =>
        op.userId === userId &&
        (!sessionId || op.payload.sessionId === sessionId),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function enqueueOperation(userId, payload, labels = {}) {
  captureSession(userId);
  const id = crypto.randomUUID();
  const saved = {
    id,
    userId,
    payload: {
      ...payload,
      operationId: id,
      observedAt: new Date().toISOString(),
    },
    labels,
    createdAt: new Date().toISOString(),
    state: "PENDING",
    tries: 0,
    nextAttemptAt: 0,
  };
  // The draft IS the durable outbox row, so saving it cannot split across two writes.
  await operation("operations", "readwrite", (s) => s.add(saved));
  changed();
  return saved;
}
export async function saveMark(userId, sessionId, studentId, status, reason) {
  const bundle = await savedRegister(userId, sessionId);
  if (
    !bundle ||
    bundle.purpose !== "MARK" ||
    Date.parse(bundle.expiresAt) <= Date.now()
  )
    throw new Error(
      "Prepare this class online before recording offline marks.",
    );
  const row = bundle.roster.find((r) => r.student.id === studentId);
  if (!row) throw new Error("This student is not in the prepared roster.");
  const prior = await operations(userId, sessionId);
  if (
    prior.some(
      (op) =>
        op.payload.studentId === studentId &&
        (op.state === "PENDING" ||
          (op.payload.preparationId === bundle.preparationId &&
            op.state === "SYNCED")),
    )
  )
    throw new Error(
      "Synchronize the saved mark and refresh the prepared roster before marking this student again.",
    );
  return enqueueOperation(
    userId,
    {
      type: "MARK",
      sessionId,
      studentId,
      status,
      reason,
      preparationId: bundle.preparationId,
      baseSessionVersion: bundle.session.version,
      baseAttendanceVersion: row.attendance?.version || 0,
    },
    { courseCode: bundle.session.courseCode, studentName: row.student.name },
  );
}
export async function keepServer(userId, id) {
  captureSession(userId);
  await modify("operations", id, (op) =>
    op?.userId === userId &&
    ["CONFLICT", "NEEDS_REVIEW", "DENIED"].includes(op.state)
      ? { ...op, state: "DISMISSED", dismissedAt: new Date().toISOString() }
      : undefined,
  );
  changed();
}
const busy = new Set();
export async function syncOperations(userId) {
  if (busy.has(userId) || !navigator.onLine) return;
  const session = captureSession(userId);
  busy.add(userId);
  let touched = false;
  try {
    await withLease("operations:" + userId, async (held) => {
      for (const op of await operations(userId)) {
        if (!sameSession(session) || !(await held())) break;
        if (op.state !== "PENDING" || op.nextAttemptAt > Date.now()) continue;
        touched = true;
        try {
          const data = await api("/sync/operations", {
            method: "POST",
            session,
            body: { actorId: userId, operations: [op.payload] },
          });
          const result = data.results?.[0];
          if (
            result?.operationId !== op.id ||
            !["ACCEPTED", "CONFLICT", "NEEDS_REVIEW", "DENIED"].includes(
              result.outcome,
            )
          ) {
            const error = new Error(
              "Unexpected synchronization response. Your work is retained.",
            );
            error.status = 502;
            throw error;
          }
          if (!sameSession(session) || !(await held())) break;
          await modify("operations", op.id, (current) =>
            current
              ? {
                  ...current,
                  state:
                    result.outcome === "ACCEPTED" ? "SYNCED" : result.outcome,
                  result,
                  acknowledgedAt: result.receivedAt,
                }
              : undefined,
          );
          if (result.outcome === "ACCEPTED" && op.payload.reviewOf)
            await modify("operations", op.payload.reviewOf, (original) =>
              original
                ? { ...original, state: "RESOLVED", resolvedBy: op.id }
                : undefined,
            );
        } catch (error) {
          if (error.identity || !sameSession(session)) break;
          if (!(await held())) break;
          await modify("operations", op.id, (current) => {
            if (!current) return undefined;
            const tries = current.tries + 1;
            return {
              ...current,
              tries,
              error: error.message,
              state:
                retryable(error) || error.status === 401 ? "PENDING" : "DENIED",
              nextAttemptAt:
                Date.now() +
                Math.max(
                  error.retryAfterMs || 0,
                  Math.min(300000, 2000 * 2 ** Math.min(tries - 1, 8)) *
                    (0.75 + Math.random() * 0.5),
                ),
            };
          });
          if (retryable(error) || error.status === 401) break;
        }
      }
    });
  } finally {
    busy.delete(userId);
    if (touched) changed();
  }
}
