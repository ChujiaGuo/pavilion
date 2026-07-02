const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function apiPatch<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}
