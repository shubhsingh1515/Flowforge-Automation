import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

// Load environment variables from root .env or apps/api/.env
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PREFIX: z.string().default("/api/v1"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(16).default("flowforge-super-secret-development-jwt-key-2026-min-32-chars"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_SECRET: z.string().min(16).default("flowforge-development-cookie-secret-key-at-least-32-chars"),
  DATABASE_URL: z.string().default("postgresql://flowforge:flowforge_dev_password@localhost:5432/flowforge_db?schema=public"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  CREDENTIAL_ENCRYPTION_KEY: z.string().default("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  MAX_WORKFLOW_STEPS: z.coerce.number().default(500),
  MAX_EXECUTION_DURATION_SECONDS: z.coerce.number().default(300),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Environment validation error:", parsed.error.format());
  throw new Error("Invalid application configuration");
}

const env = parsed.data;

// In production, enforce non-default secrets
if (env.NODE_ENV === "production") {
  const insecureDefaults = [
    "flowforge-super-secret-development-jwt-key-2026-min-32-chars",
    "flowforge-development-secret-key-change-in-production-min-32-chars",
    "flowforge-development-cookie-secret-key-at-least-32-chars",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ];

  if (insecureDefaults.includes(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
    throw new Error("FATAL: Insecure or default JWT_SECRET detected in production. Must be at least 32 characters.");
  }

  if (insecureDefaults.includes(env.COOKIE_SECRET) || env.COOKIE_SECRET.length < 32) {
    throw new Error("FATAL: Insecure or default COOKIE_SECRET detected in production. Must be at least 32 characters.");
  }

  if (insecureDefaults.includes(env.CREDENTIAL_ENCRYPTION_KEY) || env.CREDENTIAL_ENCRYPTION_KEY.length < 32) {
    throw new Error("FATAL: Insecure or default CREDENTIAL_ENCRYPTION_KEY detected in production. Must be at least 32 characters.");
  }
}

export const config = {
  port: env.PORT,
  host: env.HOST,
  nodeEnv: env.NODE_ENV,
  apiPrefix: env.API_PREFIX,
  corsOrigin: env.CORS_ORIGIN,
  frontendUrl: env.FRONTEND_URL,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  cookieSecret: env.COOKIE_SECRET,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  credentialEncryptionKey: env.CREDENTIAL_ENCRYPTION_KEY,
  maxWorkflowSteps: env.MAX_WORKFLOW_STEPS,
  maxExecutionDurationSeconds: env.MAX_EXECUTION_DURATION_SECONDS,
};
