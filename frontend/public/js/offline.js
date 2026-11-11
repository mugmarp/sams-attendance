import { api } from "./api.js";
const connection = new Promise((resolve, reject) => {
  const request = indexedDB.open("sams-plain-js-v1", 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore("attempts", { keyPath: "id" });
    request.result.createObjectStore("snapshots");
  };
  request.onsuccess = () => {
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  request.onerror = () => reject(request.error);
});
async function operation(store, mode, perform) {
  const db = await connection;
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
const changed = () => dispatchEvent(new Event("sams:queue"));
export async function attempts(userId) {
  return (await operation("attempts", "readonly", (s) => s.getAll())).filter(
    (a) => a.userId === userId,
  );
}
export async function remove(id) {
  await operation("attempts", "readwrite", (s) => s.delete(id));
  changed();
}
export async function queue(input) {
  await operation("attempts", "readwrite", (s) =>
    s.put({
      ...input,
      id: input.userId + ":" + input.sessionId,
      createdAt: new Date().toISOString(),
      tries: 0,
      state: "PENDING",
    }),
  );
  changed();
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
    const data = await api(path);
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
let syncing = false;
export async function sync(userId) {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    for (const attempt of await attempts(userId)) {
      if (attempt.state !== "PENDING") continue;
      try {
        await api("/student/checkin", {
          method: "POST",
          body: { sessionId: attempt.sessionId, code: attempt.code },
        });
        await remove(attempt.id);
      } catch (error) {
        attempt.tries++;
        attempt.error = error.message;
        if (!error.network || attempt.tries >= 5) attempt.state = "FAILED";
        await operation("attempts", "readwrite", (s) => s.put(attempt));
        changed();
        if (error.network) break;
      }
    }
  } finally {
    syncing = false;
  }
}
