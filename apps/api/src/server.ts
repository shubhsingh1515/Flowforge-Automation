import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
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
import { oauthRoutes } from "./routes/oauth.js";
import { approvalRoutes } from "./routes/approvals.js";
import { billingRoutes } from "./routes/billing.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { apiKeyRoutes } from "./routes/apiKeys.js";
import { outboundWebhookRoutes } from "./routes/outboundWebhooks.js";
import { customIntegrationRoutes } from "./routes/customIntegrations.js";
import { marketplaceRoutes } from "./routes/marketplace.js";
import { governanceRoutes } from "./routes/governance.js";
import { dataRetentionRoutes } from "./routes/dataRetention.js";
import { readinessRoutes } from "./routes/readiness.js";
import { ssoRoutes } from "./routes/sso.js";
import { scimRoutes } from "./routes/scim.js";
import { sessionRoutes } from "./routes/sessions.js";
import { diagnosticsRoutes } from "./routes/diagnostics.js";
import { operationsRoutes } from "./routes/operations.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { usageAlertRoutes } from "./routes/usageAlerts.js";
import { notificationRoutes } from "./routes/notifications.js";
import { supportRoutes } from "./routes/support.js";
import { environmentRoutes } from "./routes/environments.js";
import { releaseRoutes } from "./routes/releases.js";
import { deploymentRoutes } from "./routes/deployments.js";
import { workflowTestingRoutes } from "./routes/workflowTesting.js";
import { aiRoutes } from "./routes/ai.js";
import { collaborationRoutes } from "./routes/collaboration.js";
import { residencyRoutes } from "./routes/residency.js";
import { cmekRoutes } from "./routes/cmek.js";
import { incidentRoutes } from "./routes/incidents.js";
import { remediationRoutes } from "./routes/remediations.js";
import { observabilityRoutes } from "./routes/observability.js";
import { connectorRoutes } from "./routes/connectors.js";
import { simulationRoutes } from "./routes/simulations.js";
import { chaosRoutes } from "./routes/chaos.js";
import { optimizationRoutes } from "./routes/optimizations.js";
import { processRoutes } from "./routes/processes.js";
import { eventRoutes } from "./routes/events.js";
import { startWorker, stopWorker } from "./worker/worker.js";
import { startOutboundWebhookWorker, stopOutboundWebhookWorker } from "./worker/outboundWebhookWorker.js";
import { workflowScheduler } from "./worker/scheduler.js";
import { httpRequestDuration, httpRequestsTotal } from "./metrics.js";
import { APP_CONFIG } from "@flowforge/shared";

export interface BuildServerOptions {
  enableWorker?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const server = Fastify({
    logger: {
      level: config.nodeEnv === "development" ? "info" : "warn",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']",
        "password",
        "token",
        "secret",
        "credentials",
        "apiKey",
      ],
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB payload limit
  });

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Security Headers (Helmet)
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", config.frontendUrl],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Rate Limiting
  await server.register(rateLimit, {
    max: process.env.NODE_ENV === "production" ? 1000 : 3000,
    timeWindow: "1 minute",
    allowList: (req) => {
      const url = req.url || "";
      return url.startsWith(`${config.apiPrefix}/health`) || url === `${config.apiPrefix}/metrics`;
    },
  });

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

  // Observability: Metrics collection hooks
  server.addHook("onRequest", async (req) => {
    (req as any)._startTime = process.hrtime();
  });

  server.addHook("onResponse", async (req, reply) => {
    const startTime = (req as any)._startTime;
    if (startTime) {
      const diff = process.hrtime(startTime);
      const durationSeconds = diff[0] + diff[1] / 1e9;
      const route = req.routeOptions?.url || req.url;
      httpRequestDuration.observe(
        { method: req.method, route, status_code: reply.statusCode.toString() },
        durationSeconds
      );
      httpRequestsTotal.inc({
        method: req.method,
        route,
        status_code: reply.statusCode.toString(),
      });
    }
  });

  // CORS
  await server.register(cors, {
    origin: (origin, cb) => {
      if (config.nodeEnv !== "production") {
        if (!origin || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
          cb(null, true);
          return;
        }
      }
      if (origin === config.frontendUrl || origin === config.corsOrigin) {
        cb(null, true);
        return;
      }
      if (!origin) {
        cb(null, true);
        return;
      }
      cb(new Error("CORS origin not allowed"), false);
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
        description: `${APP_CONFIG.tagline} - Production API Specification`,
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
          apiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
          },
        },
      },
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    },
    transform: jsonSchemaTransform,
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
      await api.register(oauthRoutes);
      await api.register(approvalRoutes);
      await api.register(billingRoutes);
      await api.register(onboardingRoutes);
      await api.register(apiKeyRoutes);
      await api.register(outboundWebhookRoutes);
      await api.register(customIntegrationRoutes);
      await api.register(marketplaceRoutes);
      await api.register(governanceRoutes);
      await api.register(dataRetentionRoutes);
      await api.register(readinessRoutes);
      await api.register(ssoRoutes);
      await api.register(scimRoutes);
      await api.register(sessionRoutes);
      await api.register(diagnosticsRoutes);
      await api.register(operationsRoutes);
      await api.register(analyticsRoutes);
      await api.register(usageAlertRoutes);
      await api.register(notificationRoutes);
      await api.register(supportRoutes);
      await api.register(environmentRoutes);
      await api.register(releaseRoutes);
      await api.register(deploymentRoutes);
      await api.register(workflowTestingRoutes);
      await api.register(aiRoutes);
      await api.register(collaborationRoutes);
      await api.register(residencyRoutes);
      await api.register(cmekRoutes);
      await api.register(incidentRoutes);
      await api.register(remediationRoutes);
      await api.register(observabilityRoutes);
      await api.register(connectorRoutes);
      await api.register(simulationRoutes);
      await api.register(chaosRoutes);
      await api.register(optimizationRoutes);
      await api.register(processRoutes);
      await api.register(eventRoutes);
    },
    { prefix: config.apiPrefix }
  );

  // Background Worker & Scheduler startup if enabled
  if (options.enableWorker !== false) {
    startWorker();
    startOutboundWebhookWorker();
    workflowScheduler.syncSchedulesOnStartup().catch((err) => {
      server.log.warn({ msg: "Schedule sync failed on startup", error: err.message });
    });
  }

  // Graceful shutdown
  server.addHook("onClose", async () => {
    await stopWorker();
    await stopOutboundWebhookWorker();
  });

  return server;
}

async function main() {
  const server = await buildServer({ enableWorker: true });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down server gracefully...`);
    try {
      await server.close();
      await stopWorker();
      await stopOutboundWebhookWorker();
      console.log("FlowForge API shutdown complete.");
      process.exit(0);
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await server.listen({ port: config.port, host: config.host });
    console.log(`🚀 ${APP_CONFIG.name} API running at http://${config.host}:${config.port}${config.apiPrefix}`);
    console.log(`📖 OpenAPI documentation available at http://localhost:${config.port}${config.apiPrefix}/docs`);
    console.log(`📊 Metrics available at http://localhost:${config.port}${config.apiPrefix}/metrics`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  main();
}
