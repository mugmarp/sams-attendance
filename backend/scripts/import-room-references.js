import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { roomCandidates } from "../src/services/rooms.js";
import { digest, audit } from "../src/services/academic.js";
const [file, actorId, expectedHash] = process.argv.slice(2);
if (!file || !actorId)
  throw Error(
    "Usage: node scripts/import-room-references.js TIMETABLE.json REGISTRAR_ID [PREVIEW_HASH]",
  );
const db = new PrismaClient();
try {
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(rows) || rows.length > 5000)
    throw Error("Bounded timetable rows required");
  const candidates = roomCandidates(rows),
    hash = digest(candidates);
  if (!expectedHash) console.log(JSON.stringify({ hash, candidates }, null, 2));
  else {
    if (hash !== expectedHash)
      throw Error("Room source changed; preview again");
    await db.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (
        actor?.role !== "ADMIN" ||
        !actor.isActive ||
        actor.mustChangePassword
      )
        throw Error("Active registrar required");
      for (const r of candidates.filter((r) => !r.issue))
        await tx.room.upsert({
          where: { code: r.code },
          update: {},
          create: {
            code: r.code,
            name: r.name,
            aliases: [],
            sourceNote: "Unverified timetable venue label; source hash " + hash,
          },
        });
      await audit(
        tx,
        actorId,
        "ROOM_REFERENCES_STAGED",
        "RoomSource",
        hash,
        null,
        {
          candidates: candidates.length,
          excluded: candidates.filter((r) => r.issue).length,
        },
        "Imported source labels as inactive references; no campus, capacity or building inferred",
      );
    });
    console.log(
      JSON.stringify({
        staged: candidates.filter((r) => !r.issue).length,
        needsReview: candidates.filter((r) => r.issue).length,
        hash,
      }),
    );
  }
} finally {
  await db.$disconnect();
}
