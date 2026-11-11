import { createHmac, timingSafeEqual } from "node:crypto";
export const ROTATION_MS = 2 * 60_000;
export const WINDOW_MS = 10 * 60_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function currentCode(secret, startedAt, closesAt, now = new Date()) {
  if (now < startedAt || now >= closesAt) return null;
  const slot = Math.floor((now.getTime() - startedAt.getTime()) / ROTATION_MS);
  const bytes = createHmac("sha256", secret).update(String(slot)).digest();
  const code = Array.from(
    bytes.subarray(0, 6),
    (b) => ALPHABET[b % ALPHABET.length],
  ).join("");
  return {
    code,
    expiresAt: new Date(
      Math.min(
        startedAt.getTime() + (slot + 1) * ROTATION_MS,
        closesAt.getTime(),
      ),
    ),
    closesAt,
  };
}
export function matchesCode(expected, supplied) {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied.trim().toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
export function attendanceResult(presentCount, totalSessions, threshold = 80) {
  return {
    presentCount,
    totalSessions,
    attendancePct: totalSessions
      ? Math.round((presentCount * 10000) / totalSessions) / 100
      : null,
    eligible:
      totalSessions > 0 && presentCount * 100 >= totalSessions * threshold,
  };
}
export function kampalaDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
