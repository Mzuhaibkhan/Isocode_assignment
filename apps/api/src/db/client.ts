import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

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

  // Execute generated migration to build all tables
  const migrationPath = path.resolve(process.cwd(), "src/db/migrations/0000_stormy_exodus.sql");
  if (fs.existsSync(migrationPath)) {
    const sqlContent = fs.readFileSync(migrationPath, "utf-8");
    const statements = sqlContent
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await pgliteClient.exec(stmt);
    }
  }

  // Seed the test database
  const { runSeed } = await import("./seed.js");
  await runSeed(dbInstance);
} else {
  poolInstance = new Pool({ connectionString: config.DATABASE_URL });
  const { drizzle } = await import("drizzle-orm/node-postgres");
  dbInstance = drizzle(poolInstance, { schema });
}

export const pool = poolInstance;
export const db = dbInstance;
