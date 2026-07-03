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
  const chain: Record<string, any> = {};
  chain['select'] = vi.fn(() => chain);
  chain['eq'] = vi.fn(() => chain);
  chain['ilike'] = vi.fn(() => chain);
  chain['limit'] = vi.fn(() => chain);
  chain['update'] = vi.fn(() => chain);
  chain['insert'] = vi.fn(() => chain);
  chain['is'] = vi.fn(() => chain);
  chain['single'] = vi.fn();
  chain['resolveAs'] = (value: any) => {
    const p = Promise.resolve(value);
    chain['then'] = p.then.bind(p);
    chain['catch'] = p.catch.bind(p);
    chain['finally'] = p.finally.bind(p);
  };
  return chain;
}

function singleChain(data: any) {
  const chain = makeChain();
  chain['single'].mockResolvedValue({ data, error: data ? null : new Error('not found') });
  return chain;
}

function arrayChain(data: any[]) {
  const chain = makeChain();
  chain.resolveAs({ data, error: null });
  return chain;
}

const mockFrom = vi.mocked(supabase.from);
const mockGetUser = vi.mocked(supabase.auth.getUser);

const USER_ID = 'user-1';
const USER_ROW = {
  id: USER_ID,
  display_name: 'Alice',
  first_name: null,
  last_name: null,
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
// GET / (search)
// ---------------------------------------------------------------------------

describe('GET /', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await userRouter.request('/?q=ali');
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is below moderator rank', async () => {
    mockFrom.mockReturnValueOnce(singleChain(null) as any); // admin-role check

    const res = await userRouter.request('/?q=ali', { headers: withAuth() });
    expect(res.status).toBe(403);
  });

  it('returns matching users for a moderator+ caller', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'moderator' }) as any) // admin-role check
      .mockReturnValueOnce(arrayChain([USER_ROW]) as any); // search query

    const res = await userRouter.request('/?q=ali', { headers: withAuth() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [expect.objectContaining({ id: USER_ID })] });
  });
});

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

  it('returns 403 when patching a different user and caller has no admin role', async () => {
    mockFrom.mockReturnValueOnce(singleChain(null) as any); // admin-role check — no role

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth('other-user'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Bob' }),
    });
    expect(res.status).toBe(403);
  });

  it('allows a moderator+ caller to patch a different user, bypassing the name lock', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'moderator' }) as any) // admin-role check
      .mockReturnValueOnce(singleChain({ ...USER_ROW, verified_tier: 8 }) as any) // before-fetch
      .mockReturnValueOnce(singleChain({ ...USER_ROW, verified_tier: 8, first_name: 'Fixed' }) as any) // update
      .mockReturnValueOnce(arrayChain([]) as any); // admin_user_edits audit insert

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth('moderator-1'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Fixed' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).firstName).toBe('Fixed');
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

  it.each([
    ['displayName', ''],
    ['displayName', '   '],
    ['displayName', 42],
    ['firstName', 42],
    ['lastName', 42],
    ['photoUrl', 42],
    ['city', 42],
    ['region', 42],
    ['preferredFormats', 'singles'],
    ['preferredFormats', ['not-a-format']],
    ['playStyle', 'not-a-style'],
    ['privacyLevel', 'not-a-level'],
  ])('returns 400 for invalid %s (%j), without reaching the DB', async (field, value) => {
    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('accepts null for nullable fields (firstName, lastName, photoUrl)', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: USER_ROW, error: null });

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: null, lastName: null, photoUrl: null }),
    });
    expect(res.status).toBe(200);
  });

  it('ignores fields outside the editable set (e.g. internalScore) rather than rejecting the request', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({
      data: { ...USER_ROW, display_name: 'Bob' },
      error: null,
    });

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Bob', internalScore: 10, verifiedTier: 10 }),
    });
    expect(res.status).toBe(200);
    // updateUser() only ever reads the nine named fields — see user.service.ts —
    // so unvalidated extra keys are structurally inert, not just unvalidated.
    const updateArg = chain['update'].mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).toEqual({ display_name: 'Bob' });
  });

  it('returns 403 when changing firstName/lastName on a verified profile', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: { verified_tier: 8 }, error: null });

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'NewName' }),
    });
    expect(res.status).toBe(403);
    expect(chain['update']).not.toHaveBeenCalled();
  });

  it('allows non-name field changes on a verified profile', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: { ...USER_ROW, verified_tier: 8 }, error: null });

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'Seattle' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when a moderator+ caller clears a verified user\'s name without unverifying', async () => {
    const updateChain = makeChain();
    updateChain['single'].mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'violates check constraint "profiles_verified_requires_name"' },
    });
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'moderator' }) as any) // admin-role check
      .mockReturnValueOnce(singleChain({ ...USER_ROW, verified_tier: 8 }) as any) // audit before-fetch
      .mockReturnValueOnce(updateChain as any); // update() rejected by the DB constraint

    const res = await userRouter.request(`/${USER_ID}`, {
      method: 'PATCH',
      headers: { ...withAuth('moderator-1'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: null, lastName: null }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/verified user must have a first and last name/i);
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

// ---------------------------------------------------------------------------
// PATCH /:id/verify
// ---------------------------------------------------------------------------

describe('PATCH /:id/verify', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await userRouter.request(`/${USER_ID}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ verified: true }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when verified is not a boolean', async () => {
    const res = await userRouter.request(`/${USER_ID}/verify`, {
      method: 'PATCH',
      headers: { ...withAuth('admin-1'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: 'yes' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 403 when caller is below admin rank', async () => {
    mockFrom.mockReturnValueOnce(singleChain({ role: 'moderator' }) as any); // admin-role check

    const res = await userRouter.request(`/${USER_ID}/verify`, {
      method: 'PATCH',
      headers: { ...withAuth('mod-1'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: true }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 when verifying a user with no first/last name on file', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any) // admin-role check
      .mockReturnValueOnce(singleChain(USER_ROW) as any); // profile fetch — no name

    const res = await userRouter.request(`/${USER_ID}/verify`, {
      method: 'PATCH',
      headers: { ...withAuth('admin-1'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: true }),
    });
    expect(res.status).toBe(400);
  });

  it('verifies a user and returns the updated profile on success', async () => {
    const verifiable = { ...USER_ROW, first_name: 'Alice', last_name: 'Smith' };
    const updateChain = singleChain({ ...verifiable, verified_tier: 8, rating_floor: 6.0 });
    const auditChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any) // admin-role check
      .mockReturnValueOnce(singleChain(verifiable) as any) // profile fetch
      .mockReturnValueOnce(updateChain as any) // update
      .mockReturnValueOnce(auditChain as any); // audit insert

    const res = await userRouter.request(`/${USER_ID}/verify`, {
      method: 'PATCH',
      headers: { ...withAuth('admin-1'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verifiedTier).toBe(8);
    expect(body.ratingFloor).toBe(6.0);
  });
});
