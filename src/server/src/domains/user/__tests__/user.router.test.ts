import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import { supabase } from '../../../lib/supabase.js';
import { userRouter } from '../user.router.js';

function makeChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain['select'] = vi.fn(() => chain);
  chain['eq'] = vi.fn(() => chain);
  chain['update'] = vi.fn(() => chain);
  chain['is'] = vi.fn(() => chain);
  chain['single'] = vi.fn();
  return chain;
}

const mockFrom = vi.mocked(supabase.from);
const mockGetUser = vi.mocked(supabase.auth.getUser);

const USER_ID = 'user-1';
const USER_ROW = {
  id: USER_ID,
  display_name: 'Alice',
  photo_url: null,
  city: 'Vancouver',
  region: 'BC',
  preferred_formats: ['singles'],
  play_style: 'competitive',
  privacy_level: 'public',
  verified_tier: null,
  rating_floor: null,
  created_at: '2026-01-01T00:00:00Z',
};

// Configures the auth mock and returns headers with the Bearer token.
function withAuth(asUserId = USER_ID): Record<string, string> {
  mockGetUser.mockResolvedValue({
    data: { user: { id: asUserId } },
    error: null,
  } as any);
  return { Authorization: 'Bearer mock-token' };
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------

describe('GET /:id', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await userRouter.request(`/${USER_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 200 with user data for a valid request', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: USER_ROW, error: null });

    const res = await userRouter.request(`/${USER_ID}`, { headers: withAuth() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: USER_ID, displayName: 'Alice' });
  });

  it('returns 404 when the user does not exist', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: null, error: new Error('not found') });

    const res = await userRouter.request(`/${USER_ID}`, { headers: withAuth() });
    expect(res.status).toBe(404);
  });

  it('returns 404 when a private profile is viewed by a non-owner', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({
      data: { ...USER_ROW, privacy_level: 'private' },
      error: null,
    });

    const res = await userRouter.request(`/${USER_ID}`, { headers: withAuth('other-user') });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /:id
// ---------------------------------------------------------------------------

describe('PATCH /:id', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await userRouter.request(`/${USER_ID}`, { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when patching a different user', async () => {
    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth('other-user'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Bob' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 with the updated user', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({
      data: { ...USER_ROW, display_name: 'Bob' },
      error: null,
    });

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Bob' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).displayName).toBe('Bob');
  });

  it('returns 404 when the user does not exist', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: null, error: new Error('not found') });

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Bob' }),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

describe('DELETE /:id', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await userRouter.request(`/${USER_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when deleting a different user', async () => {
    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'DELETE',
      headers: withAuth('other-user'),
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 with { success: true } on soft delete', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['is'].mockResolvedValue({ error: null });

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'DELETE',
      headers: withAuth(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('returns 404 when the user does not exist or is already deleted', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['is'].mockResolvedValue({ error: new Error('not found') });

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'DELETE',
      headers: withAuth(),
    });
    expect(res.status).toBe(404);
  });
});
