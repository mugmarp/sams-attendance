import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { audit } from "../services/academic.js";
import { roomLock } from "../services/rooms.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
const router = Router();
const fields = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9-]{2,40}$/),
    name: z.string().trim().min(2).max(120),
    campus: z.string().trim().max(120).nullable().default(null),
    building: z.string().trim().max(120).nullable().default(null),
    roomType: z
      .enum(["UNSPECIFIED", "LECTURE", "LAB", "TUTORIAL", "CLINICAL", "OTHER"])
      .default("UNSPECIFIED"),
    capacity: z.number().int().min(1).max(10000).nullable().default(null),
    aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    reviewStatus: z
      .enum(["REFERENCE", "REVIEWED", "REJECTED"])
      .default("REFERENCE"),
    isActive: z.boolean().default(false),
    sourceNote: z.string().trim().min(5).max(1000),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .refine(
    (v) => !v.isActive || v.reviewStatus === "REVIEWED",
    "Active rooms must be reviewed",
  );
router.get(
  "/rooms",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        search: z.string().trim().max(100).default(""),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query);
    res.json(
      await prisma.room.findMany({
        where: {
          isActive: true,
          reviewStatus: "REVIEWED",
          ...(q.search
            ? { name: { contains: q.search, mode: "insensitive" } }
            : {}),
        },
        take: q.limit,
        skip: q.offset,
        orderBy: { name: "asc" },
      }),
    );
  }),
);
router.get(
  "/admin/rooms",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        search: z.string().trim().max(100).default(""),
        status: z.enum(["REFERENCE", "REVIEWED", "REJECTED"]).optional(),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query);
    res.json(
      await prisma.room.findMany({
        where: {
          ...(q.status ? { reviewStatus: q.status } : {}),
          ...(q.search
            ? { name: { contains: q.search, mode: "insensitive" } }
            : {}),
        },
        take: q.limit,
        skip: q.offset,
        orderBy: { name: "asc" },
      }),
    );
  }),
);
async function save(req, id) {
  const { reason, ...data } = fields.parse(req.body);
  return prisma.$transaction(async (tx) => {
    await roomLock(tx);
    const before = id ? await tx.room.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError("Room not found");
    const labels = [data.code, data.name, ...data.aliases];
    const existing = await tx.room.findMany({
      where: { ...(id ? { id: { not: id } } : {}) },
    });
    const normalize = (s) => s.trim().toLowerCase();
    if (
      existing.some((r) =>
        [r.code, r.name, ...r.aliases].some((s) =>
          labels.map(normalize).includes(normalize(s)),
        ),
      )
    )
      throw new ConflictError(
        "A room code, name or alias already belongs to another room",
      );
    const room = id
      ? await tx.room.update({ where: { id }, data })
      : await tx.room.create({ data });
    await audit(
      tx,
      req.user.userId,
      "ROOM_SAVED",
      "Room",
      room.id,
      before,
      room,
      reason,
    );
    return room;
  });
}
router.post(
  "/admin/rooms",
  requireAdmin,
  asyncHandler(async (req, res) => res.status(201).json(await save(req))),
);
router.patch(
  "/admin/rooms/:roomId",
  requireAdmin,
  asyncHandler(async (req, res) =>
    res.json(await save(req, z.string().cuid().parse(req.params.roomId))),
  ),
);
export default router;
