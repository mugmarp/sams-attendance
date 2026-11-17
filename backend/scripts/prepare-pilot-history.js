import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import {
  previewMockHistory,
  applyMockHistory,
} from "../src/services/mock-history.js";
const [mode, directory, actorId] = process.argv.slice(2);
if (!["--preview", "--apply"].includes(mode) || !directory || !actorId)
  throw Error(
    "Usage: prepare-pilot-history.js --preview|--apply PRIVATE_DIRECTORY REGISTRAR_ID",
  );
const db = new PrismaClient();
const run = (script, args) => {
  const result = spawnSync(
    process.execPath,
    [new URL(script, import.meta.url).pathname, ...args],
    { encoding: "utf8", timeout: 120000 },
  );
  if (result.status !== 0)
    throw Error(
      result.stderr || result.error?.message || "Preparation command failed",
    );
  return JSON.parse(result.stdout);
};
try {
  const file = path.join(directory, "preview.json");
  if (mode === "--preview") {
    const draft = run("./draft-mock-history.js", [directory]);
    const publication = await db.timetablePublication.findUniqueOrThrow({
      where: { id: draft.publication },
    });
    const source = path.join(directory, "room-source.json");
    fs.writeFileSync(source, JSON.stringify(publication.rows), {
      flag: "wx",
      mode: 0o600,
    });
    const rooms = run("./import-room-references.js", [source, actorId]);
    const plans = [];
    for (const item of draft.offerings.filter((r) => !r.skipped)) {
      const input = JSON.parse(fs.readFileSync(item.filename, "utf8"));
      const plan = await previewMockHistory(db, input, actorId);
      plans.push({
        filename: item.filename,
        fingerprint: plan.fingerprint,
        ...plan.summary,
      });
    }
    const result = {
      actorId,
      draft,
      roomHash: rooms.hash,
      roomCandidates: rooms.candidates.length,
      roomNeedsReview: rooms.candidates.filter((r) => r.issue),
      plans,
    };
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    const review = JSON.parse(fs.readFileSync(file, "utf8"));
    if (review.actorId !== actorId)
      throw Error("Preview belongs to another registrar");
    const rooms = run("./import-room-references.js", [
      path.join(directory, "room-source.json"),
      actorId,
      review.roomHash,
    ]);
    const results = [];
    for (const plan of review.plans) {
      const input = JSON.parse(fs.readFileSync(plan.filename, "utf8"));
      results.push(
        await applyMockHistory(db, input, actorId, plan.fingerprint),
      );
      fs.writeFileSync(
        path.join(directory, "applied.json"),
        JSON.stringify({ rooms, results }, null, 2) + "\n",
        { mode: 0o600 },
      );
    }
    console.log(JSON.stringify({ rooms, results }, null, 2));
  }
} finally {
  await db.$disconnect();
}
