import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  previewMockHistory,
  applyMockHistory,
} from "../src/services/mock-history.js";
const [file, actorId, expected] = process.argv.slice(2);
if (!file || !actorId)
  throw Error(
    "Usage: node scripts/mock-history.js PRIVATE_MANIFEST.json REGISTRAR_ID [PREVIEW_FINGERPRINT]",
  );
const db = new PrismaClient();
try {
  const input = JSON.parse(fs.readFileSync(file, "utf8"));
  const plan = await previewMockHistory(db, input, actorId);
  console.log(
    JSON.stringify(
      expected
        ? await applyMockHistory(db, input, actorId, expected)
        : { ...plan.summary, previewFingerprint: plan.fingerprint },
      null,
      2,
    ),
  );
} finally {
  await db.$disconnect();
}
