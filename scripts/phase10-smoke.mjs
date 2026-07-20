import process from 'node:process';

const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const username = process.env.SMOKE_USERNAME;
const password = process.env.SMOKE_PASSWORD;

async function readJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return { response, body };
}

const health = await readJson('/api/v1/health');
if (health.body?.data?.status !== 'ok') throw new Error('Liveness response is invalid');
const ready = await readJson('/api/v1/health/ready');
if (ready.body?.status !== 'ready') throw new Error('Readiness response is not ready');

let authenticated = false;
if (username || password) {
  if (!username || !password) throw new Error('SMOKE_USERNAME and SMOKE_PASSWORD must be provided together');
  const correlationId = crypto.randomUUID();
  const login = await readJson('/api/v1/iam/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
    body: JSON.stringify({ username, password })
  });
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie || !login.body?.userId) throw new Error('Authenticated smoke login did not create a session');
  await readJson('/api/v1/iam/auth/logout', {
    method: 'POST',
    headers: { Cookie: cookie, 'X-Correlation-Id': crypto.randomUUID() }
  });
  authenticated = true;
}

console.log(JSON.stringify({ status: 'PASSED', baseUrl, liveness: true, readiness: true, authenticated }, null, 2));
