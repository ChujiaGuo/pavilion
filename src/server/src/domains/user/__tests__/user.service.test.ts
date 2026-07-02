import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import { supabase } from '../../../lib/supabase.js';
import { getUserById, updateUser, softDeleteUser } from '../user.service.js';

// Builds a fresh Supabase query builder chain for each test.
// Methods return `chain` for chaining; `single` and the terminal `is` are
// configured per-test via mockResolvedValue.
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

const BASE_ROW = {
  id: 'user-1',
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

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// getUserById
// ---------------------------------------------------------------------------

describe('getUserById', () => {
  it('returns a mapped camelCase user for a public profile', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: BASE_ROW, error: null });

    const user = await getUserById('user-1', 'requester');
    expect(user).toMatchObject({
      id: 'user-1',
      displayName: 'Alice',
      city: 'Vancouver',
      privacyLevel: 'public',
    });
  });

  it('blocks access to a private profile when requester is not the owner', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({
      data: { ...BASE_ROW, privacy_level: 'private' },
      error: null,
    });

    expect(await getUserById('user-1', 'other-user')).toBeNull();
  });

  it('allows owner to view their own private profile', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({
      data: { ...BASE_ROW, privacy_level: 'private' },
      error: null,
    });

    expect(await getUserById('user-1', 'user-1')).not.toBeNull();
  });

  it('returns null when DB returns an error', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: null, error: new Error('not found') });

    expect(await getUserById('user-1', 'user-1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateUser
// ---------------------------------------------------------------------------

describe('updateUser', () => {
  it('returns updated user with camelCase fields', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({
      data: { ...BASE_ROW, display_name: 'Bob' },
      error: null,
    });

    const user = await updateUser('user-1', { displayName: 'Bob' });
    expect(user?.displayName).toBe('Bob');
  });

  it('maps camelCase input fields to snake_case DB columns', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: BASE_ROW, error: null });

    await updateUser('user-1', {
      displayName: 'Bob',
      firstName: 'Bob',
      lastName: 'Smith',
      photoUrl: 'https://img.example.com/a.jpg',
      playStyle: 'competitive',
    });

    expect(chain['update']).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: 'Bob',
        first_name: 'Bob',
        last_name: 'Smith',
        photo_url: 'https://img.example.com/a.jpg',
        play_style: 'competitive',
      })
    );
  });

  it('only includes provided fields in the update payload', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: BASE_ROW, error: null });

    await updateUser('user-1', { displayName: 'Bob' });

    const updateArg = chain['update'].mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(updateArg)).toEqual(['display_name']);
  });

  it('returns null when DB returns an error', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: null, error: new Error('not found') });

    expect(await updateUser('user-1', { displayName: 'Bob' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// softDeleteUser
// ---------------------------------------------------------------------------

describe('softDeleteUser', () => {
  // softDeleteUser's terminal is .is() — it awaits the result of .is() directly.
  it('returns true when the update succeeds', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['is'].mockResolvedValue({ error: null });

    expect(await softDeleteUser('user-1')).toBe(true);
  });

  it('returns false when the DB returns an error', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['is'].mockResolvedValue({ error: new Error('DB error') });

    expect(await softDeleteUser('user-1')).toBe(false);
  });

  it('sets deleted_at to an ISO timestamp', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['is'].mockResolvedValue({ error: null });

    await softDeleteUser('user-1');

    const updateArg = chain['update'].mock.calls[0][0] as Record<string, unknown>;
    expect(typeof updateArg['deleted_at']).toBe('string');
    expect(new Date(updateArg['deleted_at'] as string).getTime()).not.toBeNaN();
  });
});
