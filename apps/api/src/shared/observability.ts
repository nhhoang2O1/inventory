const counters = new Map<string, number>();
let inFlight = 0;
let totalDurationMs = 0;
let completed = 0;

export function observeRequest(method: string, route: string, status: number, durationMs: number) {
  const key = `${method.toUpperCase()}|${route}|${status}`;
  counters.set(key, (counters.get(key) ?? 0) + 1);
  totalDurationMs += durationMs;
  completed += 1;
}

export function beginRequest() { inFlight += 1; }
export function endRequest() { inFlight = Math.max(0, inFlight - 1); }

export function prometheusMetrics() {
  const lines = [
    '# HELP wms_http_requests_total Total HTTP requests by method, route and status.',
    '# TYPE wms_http_requests_total counter'
  ];
  for (const [key, count] of counters) {
    const [method, route, status] = key.split('|');
    lines.push(`wms_http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`);
  }
  lines.push('# HELP wms_http_requests_in_flight Current in-flight HTTP requests.');
  lines.push('# TYPE wms_http_requests_in_flight gauge');
  lines.push(`wms_http_requests_in_flight ${inFlight}`);
  lines.push('# HELP wms_http_request_duration_ms_avg Average completed request duration in milliseconds.');
  lines.push('# TYPE wms_http_request_duration_ms_avg gauge');
  lines.push(`wms_http_request_duration_ms_avg ${completed ? (totalDurationMs / completed).toFixed(2) : '0'}`);
  return `${lines.join('\n')}\n`;
}
