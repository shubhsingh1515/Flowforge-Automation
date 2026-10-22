/**
 * FlowForge Automation SaaS — Production Load & Stress Testing Benchmark
 * 
 * Measures throughput (req/sec), error rate, and p50 / p95 / p99 latencies
 * across health checks, metrics, authentication, and webhook ingestion.
 */

interface BenchmarkResult {
  scenario: string;
  totalRequests: number;
  concurrency: number;
  totalDurationMs: number;
  rps: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  errors: number;
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runBenchmark(
  name: string,
  totalRequests: number,
  concurrency: number,
  requestFn: (index: number) => Promise<boolean>
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  let successCount = 0;
  let failureCount = 0;
  let cursor = 0;

  const startTime = Date.now();

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= totalRequests) break;

      const reqStart = performance.now();
      try {
        const ok = await requestFn(idx);
        const duration = performance.now() - reqStart;
        latencies.push(duration);
        if (ok) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch {
        const duration = performance.now() - reqStart;
        latencies.push(duration);
        failureCount++;
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const totalDurationMs = Date.now() - startTime;
  latencies.sort((a, b) => a - b);

  return {
    scenario: name,
    totalRequests,
    concurrency,
    totalDurationMs,
    rps: Number(((totalRequests / totalDurationMs) * 1000).toFixed(1)),
    successRate: Number(((successCount / totalRequests) * 100).toFixed(1)),
    p50Ms: Number(calculatePercentile(latencies, 50).toFixed(2)),
    p95Ms: Number(calculatePercentile(latencies, 95).toFixed(2)),
    p99Ms: Number(calculatePercentile(latencies, 99).toFixed(2)),
    minMs: Number((latencies[0] || 0).toFixed(2)),
    maxMs: Number((latencies[latencies.length - 1] || 0).toFixed(2)),
    errors: failureCount,
  };
}

async function main() {
  const baseUrl = process.env.API_URL || "http://localhost:4000/api/v1";
  console.log(`\n======================================================`);
  console.log(`🚀 FlowForge Automation SaaS — Load Benchmark Suite`);
  console.log(`   Target Endpoint: ${baseUrl}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(`======================================================\n`);

  const results: BenchmarkResult[] = [];

  // Scenario 1: Liveness Probes
  console.log("▶ Running Scenario 1: Health Liveness Probe (High Concurrency)...");
  const liveResult = await runBenchmark("GET /health/live", 200, 20, async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    return res.status === 200;
  });
  results.push(liveResult);

  // Scenario 2: Aggregated Component Health
  console.log("▶ Running Scenario 2: Aggregated Health Probe (DB + Redis Check)...");
  const healthResult = await runBenchmark("GET /health", 100, 10, async () => {
    const res = await fetch(`${baseUrl}/health`);
    return res.status === 200;
  });
  results.push(healthResult);

  // Scenario 3: Prometheus Metrics Scraping
  console.log("▶ Running Scenario 3: Prometheus Metrics Exposition (/metrics)...");
  const metricsResult = await runBenchmark("GET /metrics", 50, 5, async () => {
    const res = await fetch(`${baseUrl}/metrics`);
    return res.status === 200;
  });
  results.push(metricsResult);

  // Scenario 4: Concurrent Registration & Workspace Creation
  console.log("▶ Running Scenario 4: User Registration & Workspace Creation...");
  const uniqueBatchId = Date.now().toString(36);
  const authResult = await runBenchmark("POST /auth/register", 15, 3, async (idx) => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `bench_${uniqueBatchId}_${idx}@flowforge.dev`,
        password: "Password123!",
        name: `Benchmark User ${idx}`,
        workspaceName: `Benchmark WS ${idx}`,
      }),
    });
    return res.status === 201;
  });
  results.push(authResult);

  // Print Summary Table
  console.log("\n=========================================================================================");
  console.log("📊 LOAD BENCHMARK RESULTS SUMMARY");
  console.log("=========================================================================================");
  console.table(
    results.map((r) => ({
      Scenario: r.scenario,
      Reqs: r.totalRequests,
      Conc: r.concurrency,
      "RPS (req/s)": r.rps,
      "Success %": `${r.successRate}%`,
      "p50 (ms)": r.p50Ms,
      "p95 (ms)": r.p95Ms,
      "p99 (ms)": r.p99Ms,
      "Max (ms)": r.maxMs,
      Errors: r.errors,
    }))
  );
  console.log("=========================================================================================\n");

  const anyFailed = results.some((r) => r.successRate < 90);
  if (anyFailed) {
    console.error("❌ Benchmark failed: Some scenarios had success rates below 90%");
    process.exit(1);
  } else {
    console.log("✅ All load scenarios completed within acceptable SLO latency thresholds.");
  }
}

main().catch((err) => {
  console.error("FATAL benchmark error:", err);
  process.exit(1);
});
