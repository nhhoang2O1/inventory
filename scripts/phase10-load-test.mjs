const baseUrl = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const path = process.env.LOAD_PATH || '/health/ready';
const durationSeconds = Number(process.env.DURATION_SECONDS || 10);
const concurrency = Math.max(1, Number(process.env.CONCURRENCY || 4));
const deadline = Date.now() + durationSeconds * 1000;
const latencies = [];
let failures = 0;
let requests = 0;

async function worker() {
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) failures += 1;
    } catch {
      failures += 1;
    } finally {
      latencies.push(performance.now() - started);
      requests += 1;
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] || 0;
const p95 = percentile(0.95);
const p99 = percentile(0.99);
console.log(JSON.stringify({ baseUrl, path, durationSeconds, concurrency, requests, failures, p95Ms: Math.round(p95), p99Ms: Math.round(p99) }));
const maxP95 = Number(process.env.MAX_P95_MS || 1000);
if (failures > 0 || p95 > maxP95) process.exitCode = 1;
