import { EnvHttpProxyAgent } from "undici";
import fs from "node:fs/promises";
import { prisma } from "../config/db.js";
import { digest, audit } from "./academic.js";
import { ValidationError, AppError } from "../utils/errors.js";
export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const root = new URL("../../../data/", import.meta.url);
const providers = {
  mylectures: "mugmarp/mylectures",
  "mylectures-2": "mugmarp/mylectures-2",
};
const busy = new Map();
let proxyAgent;
export function minute(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const h = Number(match[1]),
    m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : h === 24 && m === 0 ? 1440 : null;
}
export function inspectRow(row) {
  const issues = [];
  const weekday = DAYS.indexOf(row.day) + 1;
  const startMinute = minute(row.start_time),
    endMinute = minute(row.end_time);
  const slot = String(row.time_slot || "").split("-");
  if (!weekday) issues.push("UNKNOWN_DAY");
  if (startMinute === null || endMinute === null || endMinute <= startMinute)
    issues.push("INVALID_INTERVAL");
  if (
    slot.length === 2 &&
    (minute(slot[0]) !== startMinute || minute(slot[1]) !== endMinute)
  )
    issues.push("TIME_FIELDS_DISAGREE");
  if (!row.lecturer) issues.push("LECTURER_NOT_SPECIFIED");
  if (!row.room) issues.push("ROOM_NOT_SPECIFIED");
  if (
    !["LECTURE", "TUTORIAL", "PRACTICAL", "LAB", "CLINICAL"].includes(
      String(row.session_type).toUpperCase(),
    )
  )
    issues.push("CLASS_TYPE_REQUIRES_REVIEW");
  return { weekday, startMinute, endMinute, issues };
}
function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 5000)
    throw new ValidationError("Timetable source must contain 1–5000 rows");
  const seen = new Set();
  for (const row of rows) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.natural_key !== "string" ||
      !row.natural_key ||
      row.natural_key.length > 500 ||
      typeof row.course_code !== "string" ||
      !row.course_code ||
      typeof row.program_group !== "string"
    )
      throw new ValidationError("The source contains an invalid row identity");
    if (seen.has(row.natural_key))
      throw new ValidationError(
        "Duplicate source natural key; source requires review",
      );
    seen.add(row.natural_key);
  }
  return rows;
}
export async function calendarReference() {
  return JSON.parse(
    await fs.readFile(
      new URL("academic_calendar_reference.json", root),
      "utf8",
    ),
  );
}
async function stage(source, rows, metadata, revision, actorId) {
  validateRows(rows);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    throw new ValidationError("Invalid source metadata");
  const contentHash = digest({ rows, metadata });
  return prisma.$transaction(async (tx) => {
    const publication = await tx.timetablePublication.upsert({
      where: { source_contentHash: { source, contentHash } },
      create: { source, sourceRevision: revision, contentHash, rows, metadata },
      update: { checkedAt: new Date() },
    });
    await audit(
      tx,
      actorId,
      "TIMETABLE_SOURCE_CHECK",
      "TimetableSource",
      source,
      undefined,
      {
        publicationId: publication.id,
        sourceRevision: revision,
        contentHash,
        rowCount: rows.length,
      },
      "Source retrieved; classes are unchanged until registrar review",
    );
    return publication;
  });
}
export async function latestPublication() {
  let latest = await prisma.timetablePublication.findFirst({
    where: { source: { in: ["bundled-reference", ...Object.keys(providers)] } },
    orderBy: { checkedAt: "desc" },
  });
  if (!latest) {
    const [rows, metadata] = await Promise.all([
      fs.readFile(new URL("timetable_export.json", root), "utf8"),
      fs.readFile(new URL("timetable_metadata.json", root), "utf8"),
    ]);
    latest = await stage(
      "bundled-reference",
      JSON.parse(rows),
      JSON.parse(metadata),
      null,
      null,
    );
  }
  return latest;
}
async function fetchJson(url) {
  if (
    !proxyAgent &&
    (process.env.https_proxy ||
      process.env.HTTPS_PROXY ||
      process.env.http_proxy ||
      process.env.HTTP_PROXY)
  )
    proxyAgent = new EnvHttpProxyAgent();
  const response = await fetch(url, {
    ...(proxyAgent ? { dispatcher: proxyAgent } : {}),
    headers: { Accept: "application/json", "User-Agent": "SAMS-Timetable" },
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Source exceeds the 2 MiB limit");
    }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function refreshSource(source, actorId = null) {
  if (!providers[source])
    throw new ValidationError("Choose an approved repository source");
  if (busy.has(source)) return busy.get(source);
  const task = (async () => {
    const recent = await prisma.auditEvent.findFirst({
      where: { entityType: "TimetableSource", entityId: source },
      orderBy: { recordedAt: "desc" },
    });
    if (
      recent &&
      recent.kind === "TIMETABLE_SOURCE_FAILURE" &&
      Date.now() - recent.recordedAt.getTime() < 60000
    )
      throw new AppError(
        "TIMETABLE_SOURCE_UNAVAILABLE",
        "Last source check failed; wait one minute before retrying. Saved data is retained.",
        503,
      );
    if (recent && Date.now() - recent.recordedAt.getTime() < 60000)
      return {
        unchanged: true,
        checkedAt: recent.recordedAt,
        message: "Source checks are limited to once per minute",
      };
    try {
      const repo = providers[source];
      const commit = await fetchJson(
        `https://api.github.com/repos/${repo}/commits/main`,
      );
      if (!/^[0-9a-f]{40}$/.test(commit.sha))
        throw new Error("Invalid source revision");
      const base = `https://raw.githubusercontent.com/${repo}/${commit.sha}/app/src/main/assets/`;
      const [rows, metadata] = await Promise.all([
        fetchJson(base + "timetable_export.json"),
        fetchJson(base + "timetable_metadata.json"),
      ]);
      const publication = await stage(
        source,
        rows,
        metadata,
        commit.sha,
        actorId,
      );
      return {
        publicationId: publication.id,
        contentHash: publication.contentHash,
        checkedAt: publication.checkedAt,
        rowCount: rows.length,
      };
    } catch (error) {
      await audit(
        prisma,
        actorId,
        "TIMETABLE_SOURCE_FAILURE",
        "TimetableSource",
        source,
        undefined,
        {
          message: "Unable to retrieve the source; last saved data is retained",
        },
        "Source unavailable, timed out or contained invalid data",
      );
      throw new AppError(
        "TIMETABLE_SOURCE_UNAVAILABLE",
        "Unable to retrieve the timetable source. Last saved data is retained; retry later.",
        503,
      );
    }
  })();
  busy.set(source, task);
  try {
    return await task;
  } finally {
    busy.delete(source);
  }
}
export function startTimetableRefresh() {
  const timer = setInterval(async () => {
    try {
      const sources = await prisma.timetablePublication.findMany({
        where: { source: { in: Object.keys(providers) } },
        select: { source: true },
        distinct: ["source"],
      });
      for (const { source } of sources)
        await refreshSource(source).catch(() => {});
    } catch {
      /* No schedule is changed by a failed source check. */
    }
  }, 30 * 60000);
  timer.unref();
  return () => clearInterval(timer);
}
