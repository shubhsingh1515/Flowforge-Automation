import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { workflowRoutes } from "./routes/workflows.js";
import { integrationRoutes } from "./routes/integrations.js";
import { connectionRoutes } from "./routes/connections.js";
import { executionRoutes } from "./routes/executions.js";
import { templateRoutes } from "./routes/templates.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { startWorker, stopWorker } from "./worker/worker.js";
import { workflowScheduler } from "./worker/scheduler.js";
import { APP_CONFIG } from "@flowforge/shared";

export interface BuildServerOptions {
  enableWorker?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const server = Fastify({
    logger: config.nodeEnv === "development" ? { level: "info" } : { level: "warn" },
  });

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Global Error Handler
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Validation failed",
        statusCode: 400,
        details: error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      });
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
        statusCode: error.statusCode,
      });
    }

    server.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "An unexpected error occurred. Please try again later.",
      statusCode: 500,
    });
  });

  // CORS
  await server.register(cors, {
    origin: (origin, cb) => {
      // Allow localhost or same-origin
      if (!origin || origin.startsWith("http://localhost")) {
        cb(null, true);
        return;
      }
      cb(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Cookies & JWT
  await server.register(cookie, {
    secret: config.cookieSecret,
    hook: "onRequest",
  });

  await server.register(jwt, {
    secret: config.jwtSecret,
  });

  // OpenAPI / Swagger Documentation
  await server.register(swagger, {
    openapi: {
      info: {
        title: `${APP_CONFIG.name} REST API`,
        description: `${APP_CONFIG.tagline} - Phase 1 Foundation API Specification`,
        version: APP_CONFIG.version,
      },
      servers: [
        {
          url: `http://localhost:${config.port}${config.apiPrefix}`,
          description: "Local Development Server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await server.register(swaggerUi, {
    routePrefix: `${config.apiPrefix}/docs`,
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });

  // Register API Routes under /api/v1
  await server.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(dashboardRoutes);
      await api.register(workflowRoutes);
      await api.register(integrationRoutes);
      await api.register(connectionRoutes);
      await api.register(executionRoutes);
      await api.register(templateRoutes);
      await api.register(workspaceRoutes);
      await api.register(webhookRoutes);
    },
    { prefix: config.apiPrefix }
  );

  // Background Worker & Scheduler startup if enabled
  if (options.enableWorker !== false) {
    startWorker();
    workflowScheduler.syncSchedulesOnStartup().catch((err) => {
      server.log.warn({ msg: "Schedule sync failed on startup", error: err.message });
    });
  }

  // Graceful shutdown
  server.addHook("onClose", async () => {
    await stopWorker();
  });

  return server;
}

async function main() {
  const server = await buildServer({ enableWorker: true });
  try {
    await server.listen({ port: config.port, host: config.host });
    console.log(`🚀 ${APP_CONFIG.name} API running at http://${config.host}:${config.port}${config.apiPrefix}`);
    console.log(`📖 OpenAPI documentation available at http://localhost:${config.port}${config.apiPrefix}/docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  main();
}
