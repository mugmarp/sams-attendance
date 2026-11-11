import { openDB } from "idb";
import { api, message, networkError } from "./api";
export interface Attempt {
  id: string;
  userId: string;
  sessionId: string;
  courseCode: string;
  code: string;
  createdAt: string;
  tries: number;
  state: "PENDING" | "FAILED";
  error?: string;
}
const db = () =>
  openDB("sams-offline-v1", 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("attempts"))
        database.createObjectStore("attempts", { keyPath: "id" });
      if (!database.objectStoreNames.contains("snapshots"))
        database.createObjectStore("snapshots");
    },
  });
const changed = () => window.dispatchEvent(new Event("sams:queue"));
export async function attempts(userId: string) {
  return ((await (await db()).getAll("attempts")) as Attempt[]).filter(
    (a) => a.userId === userId,
  );
}
export async function queueAttempt(
  input: Omit<Attempt, "id" | "createdAt" | "tries" | "state">,
) {
  await (
    await db()
  ).put("attempts", {
    ...input,
    id: `${input.userId}:${input.sessionId}`,
    createdAt: new Date().toISOString(),
    tries: 0,
    state: "PENDING",
  });
  changed();
}
export async function discard(id: string) {
  await (await db()).delete("attempts", id);
  changed();
}
let syncing = false;
export async function syncAttempts(userId: string) {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    for (const attempt of await attempts(userId)) {
      if (attempt.state !== "PENDING") continue;
      try {
        await api.post("/student/checkin", {
          sessionId: attempt.sessionId,
          code: attempt.code,
        });
        await discard(attempt.id);
      } catch (error) {
        attempt.tries++;
        attempt.error = message(error);
        if (!networkError(error) || attempt.tries >= 5)
          attempt.state = "FAILED";
        await (await db()).put("attempts", attempt);
        changed();
        if (networkError(error)) break;
      }
    }
  } finally {
    syncing = false;
  }
}

export async function saveSnapshot<T>(userId: string, url: string, value: T) {
  await (
    await db()
  ).put("snapshots", { savedAt: Date.now(), value }, `${userId}:${url}`);
}
export async function loadSnapshot<T>(
  userId: string,
  url: string,
): Promise<T | null> {
  const cached = await (await db()).get("snapshots", `${userId}:${url}`);
  return cached && Date.now() - cached.savedAt < 86400000
    ? (cached.value as T)
    : null;
}
