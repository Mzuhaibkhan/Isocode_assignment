import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

export const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  VISION_API_KEY: z.string().min(1),
  BANK_AES_KEY: z.string().length(64, "BANK_AES_KEY must be 64 hex characters (32 bytes)"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters long"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function parseConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ` - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`[FATAL] Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

// In test environment, provide fallback test config if env is not completely set
const isTestEnv = process.env.NODE_ENV === "test";
const testDefaults = isTestEnv
  ? {
      DATABASE_URL: process.env.DATABASE_URL || "postgres://postgres:dev@localhost:5432/procurement",
      VISION_API_KEY: process.env.VISION_API_KEY || "mock-vision-api-key",
      BANK_AES_KEY: process.env.BANK_AES_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      SESSION_SECRET: process.env.SESSION_SECRET || "supersecretlongsessionkeymustbe32charactersormore",
      PORT: process.env.PORT || "3000",
      NODE_ENV: "test",
    }
  : process.env;

export const config = parseConfig(testDefaults);

