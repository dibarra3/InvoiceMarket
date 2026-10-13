// `npm run db:deploy` — applies Prisma migrations. Vercel runs this in its build command for
// every deployment, but only Production has a database to migrate: Preview deployments must
// never run migrations (they'd otherwise hit whatever DATABASE_URL they inherit).
import { execSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV;
if (vercelEnv && vercelEnv !== "production") {
  console.log(`db:deploy: skipping prisma migrate deploy on Vercel "${vercelEnv}" deployment (Production only).`);
  process.exit(0);
}

execSync("prisma migrate deploy", { stdio: "inherit" });
