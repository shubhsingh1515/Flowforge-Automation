import { startWorker, stopWorker } from "./worker/worker.js";
import { workflowScheduler } from "./worker/scheduler.js";
import http from "node:http";

console.log(`⚡ Starting FlowForge Dedicated Worker (PID: ${process.pid})...`);
startWorker(10);

workflowScheduler.syncSchedulesOnStartup().catch((err) => {
  console.error("Failed to sync schedules on worker startup:", err);
});

const healthPort = process.env.WORKER_HEALTH_PORT ? parseInt(process.env.WORKER_HEALTH_PORT, 10) : 4001;
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health/live") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(healthPort, () => {
  console.log(`Worker liveness probe listening on port ${healthPort}`);
});

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down worker gracefully...`);
  healthServer.close();
  await stopWorker();
  console.log("Worker shutdown complete.");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
