const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export class ApiError extends Error {
  constructor(public status: number, path: string) {
    super(`Request to ${path} failed with status ${status}`);
  }
}

async function apiRequest<T>(
  method: 'GET' | 'PATCH' | 'POST',
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
    throw new ApiError(res.status, path);
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
