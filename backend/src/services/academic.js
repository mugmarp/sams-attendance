import { createHash } from "node:crypto";
import { z } from "zod";
import { kampalaDay } from "./rules.js";
export const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00.000Z");
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date");
export const dateValue = (value) =>
  value ? new Date(value).toISOString().slice(0, 10) : null;
export const json = (value) => JSON.parse(JSON.stringify(value));
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])]),
    );
  return value;
}
export const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(sorted(json(value))))
    .digest("hex");
export function enrollmentCovers(enrollment, startTime) {
  if (!enrollment) return false;
  const day = kampalaDay(new Date(startTime));
  return (
    (!enrollment.effectiveFrom || dateValue(enrollment.effectiveFrom) <= day) &&
    (!enrollment.effectiveUntil || day < dateValue(enrollment.effectiveUntil))
  );
}
export function enrollmentWhere(startTime) {
  const day = new Date(kampalaDay(new Date(startTime)) + "T00:00:00Z");
  return {
    AND: [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: day } }] },
      { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: day } }] },
    ],
  };
}
export function enrollmentContext(enrollment) {
  return {
    enrollmentId: enrollment.id,
    effectiveFrom: dateValue(enrollment.effectiveFrom),
    effectiveUntil: dateValue(enrollment.effectiveUntil),
  };
}
export async function audit(
  tx,
  actorId,
  kind,
  entityType,
  entityId,
  before,
  after,
  reason,
) {
  return tx.auditEvent.create({
    data: {
      actorId,
      kind,
      entityType,
      entityId,
      ...(before == null ? {} : { before: json(before) }),
      ...(after == null ? {} : { after: json(after) }),
      reason,
    },
  });
}
