import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { globalRateLimit } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import router from "./routes/api";
const app = express();
// One trusted nginx proxy in the supplied Compose deployment.
if (env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json({ limit: "16kb" }));
if (env.NODE_ENV !== "test") app.use(morgan("tiny"));
app.use("/api", globalRateLimit, router);
app.use(notFoundHandler);
app.use(errorHandler);
export default app;
