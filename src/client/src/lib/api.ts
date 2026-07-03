const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export class ApiError extends Error {
  // Best-effort parse of the response body (e.g. `{ error: 'skill_blocked' }`)
  // so callers can branch on the specific reason, not just the HTTP status.
  constructor(public status: number, path: string, public body?: unknown) {
    super(`Request to ${path} failed with status ${status}`);
  }
}

async function apiRequest<T>(
  method: 'GET' | 'PATCH' | 'POST' | 'DELETE',
  path: string,
  accessToken: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => undefined);
    throw new ApiError(res.status, path, errorBody);
  }

  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string, accessToken: string): Promise<T> {
  return apiRequest<T>('GET', path, accessToken);
}

export function apiPatch<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  return apiRequest<T>('PATCH', path, accessToken, body);
}

export function apiPost<T>(path: string, accessToken: string, body?: unknown): Promise<T> {
  return apiRequest<T>('POST', path, accessToken, body);
}

export function apiDelete<T>(path: string, accessToken: string): Promise<T> {
  return apiRequest<T>('DELETE', path, accessToken);
}
