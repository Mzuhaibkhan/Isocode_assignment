import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";
import { runSeed } from "./seed.js";

const { Pool } = pg;

let poolInstance: any = null;
let dbInstance: any = null;

if (process.env.NODE_ENV === "test") {
  // Use in-memory WebAssembly Postgres (PGlite) for isolated, fast, and fully compliant tests
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const fs = await import("node:fs");
  const path = await import("node:path");

  const pgliteClient = new PGlite();
  dbInstance = drizzle(pgliteClient, { schema });
  poolInstance = pgliteClient;

  // Execute all generated migrations in order to build every table and column
  const migrationsDir = path.resolve(process.cwd(), "src/db/migrations");
  const migrationFiles = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()
    : [];

  for (const file of migrationFiles) {
    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const statements = sqlContent
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await pgliteClient.exec(stmt);
    }
  }
} else {
  poolInstance = new Pool({ connectionString: config.DATABASE_URL });
  const { drizzle } = await import("drizzle-orm/node-postgres");
  dbInstance = drizzle(poolInstance, { schema });
}

// Seed the test database once the client is fully wired. runSeed is imported
// statically (seed.ts imports this module back, so a dynamic import inside
// the top-level await would deadlock the ESM loader).
if (process.env.NODE_ENV === "test") {
  await runSeed(dbInstance);
}

export const pool = poolInstance;
export const db = dbInstance;
