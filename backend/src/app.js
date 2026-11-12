import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { globalRateLimit } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import router from "./routes/api.js";
const app = express();
// Trust a proxy only when explicitly configured for the deployment.
if (env.TRUST_PROXY) app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json({ limit: "16kb" }));
if (env.NODE_ENV !== "test") app.use(morgan("tiny"));
app.use("/api", globalRateLimit, router);
const publicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../frontend/public",
);
app.use(express.static(publicDir, { etag: true, maxAge: 0 }));
app.get("/", (_req, res) => res.redirect("/login"));
for (const [route, page] of [
  ["/login", "login"],
  ["/timetable", "timetable"],
  ["/admin/timetable", "timetable"],
  ["/examiner/dashboard", "examiner"],
  ["/examiner/session/:id", "examiner"],
  ["/examiner/report/:courseId", "admin"],
  ["/student/checkin", "student"],
  ["/student/summary", "student"],
  ["/admin/courses", "admin"],
  ["/admin/eligibility/:courseId", "admin"],
]) {
  app.get(route, (_req, res) =>
    res.sendFile(path.join(publicDir, page + ".html")),
  );
}
app.use(notFoundHandler);
app.use(errorHandler);
export default app;
