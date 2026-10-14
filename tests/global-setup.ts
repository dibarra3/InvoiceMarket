import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

/** Integration tests run against a real, disposable Postgres (TEST_DATABASE_URL). They only
 * apply migrations (non-destructive) and delete the rows they create themselves. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set TEST_DATABASE_URL to a disposable Postgres database (a local DB or a Neon test branch — never production)."
    );
  }
  const appUrl = existsSync(".env") ? parse(readFileSync(".env")).DATABASE_URL : undefined;
  if (appUrl && appUrl === url) {
    throw new Error("TEST_DATABASE_URL must not be the same database as DATABASE_URL in .env.");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
