import { createClient } from './supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export class ApiError extends Error {
  // Best-effort parse of the response body (e.g. `{ error: 'skill_blocked' }`)
  // so callers can branch on the specific reason, not just the HTTP status.
  constructor(public status: number, path: string, public body?: unknown) {
    super(`Request to ${path} failed with status ${status}`);
  }
}

// A 401 means the token useRequireAuth handed us no longer validates
// server-side — typically the session expired while the user was already on
// a gated page, so there's no local signal to catch it before this request
// went out. Every caller already just swallows a failed request into its own
// "couldn't load" state (see profile/venues/sessions pages), which reads as
// a dead end rather than what's actually happening, so handle it once here
// instead of teaching every page to distinguish 401 from a generic failure.
let redirectingToLogin = false;

function redirectToLogin() {
  if (typeof window === 'undefined' || redirectingToLogin) return;
  redirectingToLogin = true;
  // Clears the now-invalid cached session so a direct nav back to a gated
  // page doesn't hand useRequireAuth a session that looks present locally
  // but keeps 401ing.
  void createClient().auth.signOut();
  const next = window.location.pathname;
  window.location.href = `/login?next=${encodeURIComponent(next)}`;
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

  if (res.status === 401) redirectToLogin();

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

// Server error bodies are `{ error: string }` — surface that message
// directly instead of maintaining a parallel copy of it client-side, so the
// two can't drift out of sync. Shared by every admin edit form so a 400 like
// "courtCount must be at least 1" reaches the admin instead of a generic
// "Failed to save changes."
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body) {
    const message = (err.body as { error?: unknown }).error;
    if (typeof message === 'string') return message;
  }
  return fallback;
}
