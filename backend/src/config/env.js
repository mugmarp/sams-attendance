import dotenv from "dotenv";
dotenv.config();
function required(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}
const accessSecret = required("JWT_SECRET");
const refreshSecret = required("JWT_REFRESH_SECRET");
if (
  accessSecret.length < 32 ||
  refreshSecret.length < 32 ||
  accessSecret === refreshSecret
) {
  throw new Error(
    "JWT secrets must be different and at least 32 characters long",
  );
}
if (
  process.env.NODE_ENV === "production" &&
  (accessSecret.startsWith("replace-") || refreshSecret.startsWith("replace-"))
)
  throw new Error("Replace the example JWT secrets before deployment");
export const env = {
  TRUST_PROXY: process.env.TRUST_PROXY === "1",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 3000),
  HOST: process.env.HOST ?? "0.0.0.0",
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:5173",
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: accessSecret,
  JWT_REFRESH_SECRET: refreshSecret,
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 604800,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 6000,
};
