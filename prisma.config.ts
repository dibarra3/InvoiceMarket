// Loads .env for local CLI runs (Prisma skips its own .env loading when a config file exists).
import "dotenv/config";
import { defineConfig } from "prisma/config";

// No `engine`/`datasource` here on purpose: the connection URL comes from the schema's
// `url = env("DATABASE_URL")`, which Prisma resolves only for commands that touch the database
// (migrate, db, studio) and at query time. That lets `prisma generate` — run by `postinstall`
// on every install, including Vercel Preview builds with no database — work without
// DATABASE_URL, while migrations and queries still fail loudly if it's missing.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
