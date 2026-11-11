import { env } from "./config/env.js";
import app from "./app.js";
import { prisma } from "./config/db.js";
async function main() {
  await prisma.$connect();
  const server = app.listen(env.PORT, "0.0.0.0", () =>
    process.stdout.write(`SAMS listening on port ${env.PORT}\n`),
  );
  const shutdown = () => {
    server.close(() => {
      prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
main().catch((error) => {
  process.stderr.write(`${error}\n`);
  process.exit(1);
});
