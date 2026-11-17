import { digest } from "./academic.js";
import { ConflictError } from "../utils/errors.js";

export function roomCandidates(rows) {
  return [
    ...new Set(rows.map((r) => String(r.room || "").trim()).filter(Boolean)),
  ]
    .sort()
    .map((name) => ({
      code: "REF-" + digest(name).slice(0, 12).toUpperCase(),
      name,
      // Person-like strings are retained for operator review, never auto-approved.
      issue:
        /\d|\blab\b/i.test(name) || /^[A-Z -]{2,15}$/.test(name)
          ? null
          : "REVIEW_SOURCE_FIELD",
    }));
}
export async function resolveRoom(tx, label) {
  if (!label) return null;
  return tx.room.findFirst({
    where: {
      isActive: true,
      reviewStatus: "REVIEWED",
      OR: [
        { name: { equals: label.trim(), mode: "insensitive" } },
        { code: label.trim() },
        { aliases: { has: label.trim() } },
      ],
    },
  });
}
// Shared by manual creation, timetable application and room edits. Serialize
// booking checks so two transactions cannot both approve the same room interval.
export async function roomLock(tx) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(20261117)`;
}
export async function roomBooking(
  tx,
  label,
  startTime,
  endTime,
  excludedIds = [],
  practice = false,
) {
  const room = await resolveRoom(tx, label);
  if (!room) return {};
  // Practice history uses a separate schedule and cannot reserve physical rooms.
  if (!practice) {
    const clash = await tx.session.findFirst({
      where: {
        id: { notIn: excludedIds },
        status: { not: "CANCELLED" },
        course: { isPractice: false },
        startTime: { lt: new Date(endTime) },
        endTime: { gt: new Date(startTime) },
        OR: [
          { roomId: room.id },
          { room: { in: [room.name, room.code, ...room.aliases] } },
        ],
      },
      select: { id: true },
    });
    if (clash)
      throw new ConflictError(
        `Room ${room.name} overlaps another dated class (${clash.id}). Review the booking or represent a shared class as one offering.`,
      );
  }
  return { roomId: room.id, room: room.name };
}
