import dotenv from "dotenv";
import path from "node:path";

// Load environment variables from root .env or apps/api/.env
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET || "flowforge-super-secret-development-jwt-key-2026-min-32-chars",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cookieSecret: process.env.COOKIE_SECRET || "flowforge-development-cookie-secret-key-at-least-32-chars",
  databaseUrl: process.env.DATABASE_URL || "postgresql://flowforge:flowforge_dev_password@localhost:5432/flowforge_db?schema=public",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};
