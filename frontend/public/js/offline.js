import { api, captureSession, sameSession, retryable } from "./api.js";
let connection;
function database() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open("sams-plain-js-v1", 3);
      request.onupgradeneeded = () => {
        for (const name of ["attempts", "leases", "registers", "operations"])
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, { keyPath: "id" });
        if (!request.result.objectStoreNames.contains("snapshots"))
          request.result.createObjectStore("snapshots");
      };
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => {
          request.result.close();
          connection = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(
          new Error(
            "Close other SAMS tabs to update saved storage. Your pending work is retained.",
          ),
        );
      };
    }).catch((error) => {
      connection = null;
      throw error;
    });
  return connection;
}
export async function operation(store, mode, perform) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = perform(transaction.objectStore(store));
    let result;
    request.onsuccess = () => {
      result = request.result;
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
// Read/modify/write within one transaction: never resurrect an explicitly removed operation.
export async function modify(store, id, transform) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    const records = transaction.objectStore(store);
    const request = records.get(id);
    let result;
    request.onsuccess = () => {
      result = transform(request.result);
      if (result === null) records.delete(id);
      else if (result !== undefined) records.put(result);
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
const changed = () => dispatchEvent(new Event("sams:queue"));
export async function attempts(userId) {
  return (await operation("attempts", "readonly", (s) => s.getAll()))
    .filter((a) => a.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function remove(id, userId) {
  captureSession(userId);
  await modify("attempts", id, (saved) =>
    saved?.userId === userId ? null : undefined,
  );
  changed();
}
export async function queue(input) {
  captureSession(input.userId);
  const attempt = {
    userId: input.userId,
    sessionId: input.sessionId,
    code: input.code,
    courseCode: input.courseCode,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    tries: 0,
    state: "PENDING",
    nextAttemptAt: 0,
  };
  await operation("attempts", "readwrite", (s) => s.add(attempt));
  changed();
  return attempt;
}
export async function saveSnapshot(userId, path, value) {
  await operation("snapshots", "readwrite", (s) =>
    s.put({ value, savedAt: Date.now() }, userId + ":" + path),
  );
}
export async function snapshot(userId, path) {
  const saved = await operation("snapshots", "readonly", (s) =>
    s.get(userId + ":" + path),
  );
  return saved && Date.now() - saved.savedAt < 86400000 ? saved.value : null;
}
export async function studentData(userId, path) {
  try {
    const data = await api(path, { expectedUserId: userId });
    await saveSnapshot(userId, path, data).catch(() => {});
    return { data, cached: false };
  } catch (error) {
    if (error.network) {
      const saved = await snapshot(userId, path).catch(() => null);
      if (saved) return { data: saved, cached: true };
    }
    throw error;
  }
}
const syncing = new Set();
const LEASE_MS = 30000;
export async function sync(userId) {
  if (syncing.has(userId) || !navigator.onLine) return;
  const session = captureSession(userId);
  syncing.add(userId);
  const owner = crypto.randomUUID(),
    id = "sync:" + userId;
  let acquired = false,
    heartbeat;
  const renew = async (initial = false) => {
    const lease = await modify("leases", id, (saved) => {
      if (
        saved?.owner === owner ||
        (initial && (!saved || saved.expiresAt <= Date.now()))
      )
        return { id, owner, expiresAt: Date.now() + LEASE_MS };
      return undefined;
    });
    return lease?.owner === owner;
  };
  try {
    acquired = await renew(true);
    if (!acquired) return;
    let lost = false;
    heartbeat = setInterval(() => {
      void renew()
        .then((ok) => {
          if (!ok) lost = true;
        })
        .catch(() => {
          lost = true;
        });
    }, 5000);
    for (const attempt of await attempts(userId)) {
      if (!sameSession(session) || lost || !(await renew())) break;
      if (
        attempt.state !== "PENDING" ||
        (attempt.nextAttemptAt || 0) > Date.now()
      )
        continue;
      // The operation may have been removed after the list was read.
      const saved = await operation("attempts", "readonly", (s) =>
        s.get(attempt.id),
      );
      if (!saved || !sameSession(session)) continue;
      try {
        const result = await api("/student/checkin", {
          method: "POST",
          session,
          expectedUserId: userId,
          body: {
            sessionId: attempt.sessionId,
            code: attempt.code,
            originatingUserId: userId,
          },
        });
        if (lost || !(await renew())) break;
        await modify("attempts", attempt.id, (current) => {
          if (!current) return undefined;
          const receipt = {
            ...current,
            state: "SYNCED",
            acknowledgedAt: new Date().toISOString(),
            attendanceId: result.attendance.id,
            duplicate: !!result.duplicate,
            status: result.attendance.status,
          };
          delete receipt.code;
          delete receipt.error;
          delete receipt.nextAttemptAt;
          return receipt;
        });
      } catch (error) {
        if (error.identity || !sameSession(session)) break;
        if (lost || !(await renew())) break;
        await modify("attempts", attempt.id, (current) => {
          if (!current) return undefined;
          const tries = (current.tries || 0) + 1;
          const transient = retryable(error) || error.status === 401;
          const delay =
            Math.min(300000, 2000 * 2 ** Math.min(tries - 1, 8)) *
            (0.75 + Math.random() * 0.5);
          return {
            ...current,
            tries,
            error: error.message,
            state: transient ? "PENDING" : "FAILED",
            nextAttemptAt:
              Date.now() + Math.max(delay, error.retryAfterMs || 0),
          };
        });
        if (retryable(error) || error.status === 401) break;
      }
      changed();
    }
  } finally {
    clearInterval(heartbeat);
    syncing.delete(userId);
    if (acquired)
      await modify("leases", id, (lease) =>
        lease?.owner === owner ? null : undefined,
      );
    changed();
  }
}

// Shared renewable lease for the versioned register outbox. Server receipts remain
// the final duplicate protection if a suspended tab loses its local lease.
export async function withLease(id, perform) {
  const owner = crypto.randomUUID();
  const renew = async (initial = false) => {
    const result = await modify("leases", id, (saved) =>
      saved?.owner === owner ||
      (initial && (!saved || saved.expiresAt <= Date.now()))
        ? { id, owner, expiresAt: Date.now() + LEASE_MS }
        : undefined,
    );
    return result?.owner === owner;
  };
  if (!(await renew(true))) return;
  let lost = false;
  const heartbeat = setInterval(() => {
    void renew()
      .then((ok) => {
        if (!ok) lost = true;
      })
      .catch(() => {
        lost = true;
      });
  }, 5000);
  try {
    return await perform(async () => !lost && (await renew()));
  } finally {
    clearInterval(heartbeat);
    await modify("leases", id, (saved) =>
      saved?.owner === owner ? null : undefined,
    );
  }
}
