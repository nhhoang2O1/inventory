export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string | string[];
  message?: string | string[];
  code?: string;
  correlationId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;

  constructor(message: string, status: number, problem: ProblemDetails | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

function correlationId() {
  return globalThis.crypto?.randomUUID?.() || `corr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

function errorMessage(body: unknown, fallback: string) {
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object') {
    const candidate = body as ProblemDetails;
    const detail = Array.isArray(candidate.detail) ? candidate.detail.join(', ') : candidate.detail;
    const message = Array.isArray(candidate.message) ? candidate.message.join(', ') : candidate.message;
    return detail || message || candidate.title || fallback;
  }
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { idempotent?: boolean; actorId?: string } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('X-Correlation-Id', headers.get('X-Correlation-Id') || correlationId());
  if (options.idempotent !== false && (options.method || 'GET').toUpperCase() !== 'GET') {
    headers.set('Idempotency-Key', headers.get('Idempotency-Key') || idempotencyKey());
  }
  // actorId is retained only for development compatibility. Production guards
  // overwrite it from the authenticated session and the UI never selects it.
  if (import.meta.env.DEV && options.actorId && !headers.has('x-actor-id')) headers.set('x-actor-id', options.actorId);

  const requestPath = path.startsWith('/api/v1') ? path : `/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(requestPath, { ...options, headers, credentials: 'include' });
  const body = await readBody(response);
  if (!response.ok) throw new ApiError(errorMessage(body, `Request failed (${response.status})`), response.status, (body && typeof body === 'object' ? body as ProblemDetails : null));
  return body as T;
}

export const apiGet = <T>(path: string, options?: string | { actorId?: string }) => {
  const actorId = typeof options === 'string' ? options : options?.actorId;
  return apiRequest<T>(path, actorId ? { actorId } : {});
};

export function apiCommand<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body: unknown,
  actorId?: string
): Promise<T>;
export function apiCommand<T>(
  path: string,
  body: unknown,
  options?: { actorId?: string }
): Promise<T>;
export function apiCommand<T>(
  path: string,
  methodOrBody: 'POST' | 'PUT' | 'PATCH' | 'DELETE' | unknown,
  bodyOrOptions?: unknown,
  actorId?: string
) {
  const method = typeof methodOrBody === 'string' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(methodOrBody)
    ? methodOrBody as 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    : 'POST';
  const body = method === 'POST' && methodOrBody !== 'POST' && methodOrBody !== 'PUT' && methodOrBody !== 'PATCH' && methodOrBody !== 'DELETE'
    ? methodOrBody
    : bodyOrOptions;
  const resolvedActorId = method === 'POST' && methodOrBody !== 'POST' && methodOrBody !== 'PUT' && methodOrBody !== 'PATCH' && methodOrBody !== 'DELETE'
    ? (bodyOrOptions as { actorId?: string } | undefined)?.actorId
    : actorId;
  return apiRequest<T>(path, { method, body: JSON.stringify(body), ...(resolvedActorId ? { actorId: resolvedActorId } : {}) });
}
