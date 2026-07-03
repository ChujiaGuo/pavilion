import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

import { supabase } from '../../../lib/supabase.js';
import { getUserById, updateUser, softDeleteUser, searchUsers, setVerifiedStatus } from '../user.service.js';

// Builds a fresh Supabase query builder chain for each test.
// Methods return `chain` for chaining; `single` and the terminal `is` are
// configured per-test via mockResolvedValue.
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

    const result = await updateUser('user-1', { displayName: 'Bob' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.user.displayName).toBe('Bob');
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

  it('returns not_found when DB returns an error', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: null, error: new Error('not found') });

    const result = await updateUser('user-1', { displayName: 'Bob' });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns verified_requires_name when the DB check constraint rejects clearing a verified user\'s name', async () => {
    // bypassNameLock skips the app-layer pre-check, so this is the DB's
    // profiles_verified_requires_name constraint (23514) rejecting the write.
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'violates check constraint "profiles_verified_requires_name"' },
    });

    const result = await updateUser('user-1', { firstName: null, lastName: null }, { bypassNameLock: true });
    expect(result).toEqual({ ok: false, reason: 'verified_requires_name' });
  });

  it('does not pre-check verified_tier when firstName/lastName are absent from the patch', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: BASE_ROW, error: null });

    await updateUser('user-1', { displayName: 'Bob' });

    // Only the main update's own select/eq/is/single chain — no separate
    // verified_tier lookup — so `select` is called exactly once (for the
    // update's own `.select(PROFILE_SELECT)`).
    expect(chain['select']).toHaveBeenCalledTimes(1);
  });

  it('rejects changing firstName when the profile is verified', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: { verified_tier: 8 }, error: null });

    const result = await updateUser('user-1', { firstName: 'NewName' });
    expect(result).toEqual({ ok: false, reason: 'name_locked' });
    expect(chain['update']).not.toHaveBeenCalled();
  });

  it('rejects clearing lastName to null when the profile is verified', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: { verified_tier: 8 }, error: null });

    const result = await updateUser('user-1', { lastName: null });
    expect(result).toEqual({ ok: false, reason: 'name_locked' });
    expect(chain['update']).not.toHaveBeenCalled();
  });

  it('allows firstName/lastName changes when the profile is not verified', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: { ...BASE_ROW, verified_tier: null }, error: null });

    const result = await updateUser('user-1', { firstName: 'NewName' });
    expect(result.ok).toBe(true);
  });

  it('allows non-name field changes on a verified profile', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    chain['single'].mockResolvedValue({ data: { ...BASE_ROW, verified_tier: 8 }, error: null });

    const result = await updateUser('user-1', { city: 'Seattle' });
    expect(result.ok).toBe(true);
  });

  it('bypasses the name-lock check entirely when bypassNameLock is set, even on a verified profile', async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain as any);
    // Persistent resolve — if the name-lock pre-check ran, it would read this
    // same value and see verified_tier: 8, which would otherwise reject.
    chain['single'].mockResolvedValue({ data: { ...BASE_ROW, verified_tier: 8, first_name: 'NewName' }, error: null });

    const result = await updateUser('user-1', { firstName: 'NewName' }, { bypassNameLock: true });
    expect(result.ok).toBe(true);
    // No verified_tier pre-check query — only the update's own single() call.
    expect(chain['single']).toHaveBeenCalledTimes(1);
  });

  it('writes an admin_user_edits audit row when bypassNameLock + performedBy are set', async () => {
    const beforeChain = singleChain(BASE_ROW); // city: 'Vancouver'
    const updateChain = singleChain({ ...BASE_ROW, city: 'Seattle' });
    const auditChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(beforeChain as any)
      .mockReturnValueOnce(updateChain as any)
      .mockReturnValueOnce(auditChain as any);

    await updateUser('user-1', { city: 'Seattle' }, { bypassNameLock: true, performedBy: 'mod-1' });

    expect(auditChain['insert']).toHaveBeenCalledWith({
      target_user_id: 'user-1',
      performed_by: 'mod-1',
      changes: [{ field: 'city', before: 'Vancouver', after: 'Seattle' }],
    });
  });

  it('excludes patched fields that resolve to the same value from the audit diff', async () => {
    // The admin edit form resubmits every field on save, not just the ones
    // touched — displayName is patched here but doesn't actually change.
    const beforeChain = singleChain(BASE_ROW); // displayName: 'Alice', city: 'Vancouver'
    const updateChain = singleChain({ ...BASE_ROW, city: 'Seattle' });
    const auditChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(beforeChain as any)
      .mockReturnValueOnce(updateChain as any)
      .mockReturnValueOnce(auditChain as any);

    await updateUser(
      'user-1',
      { displayName: 'Alice', city: 'Seattle' },
      { bypassNameLock: true, performedBy: 'mod-1' },
    );

    expect(auditChain['insert']).toHaveBeenCalledWith({
      target_user_id: 'user-1',
      performed_by: 'mod-1',
      changes: [{ field: 'city', before: 'Vancouver', after: 'Seattle' }],
    });
  });

  it('does not write an audit row on a self-edit (no bypassNameLock/performedBy)', async () => {
    const updateChain = singleChain(BASE_ROW);
    mockFrom.mockReturnValueOnce(updateChain as any);

    await updateUser('user-1', { city: 'Seattle' });

    // Only the update's own from() call — no admin_user_edits insert.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('does not write an audit row when bypassNameLock is set but performedBy is missing', async () => {
    const updateChain = singleChain(BASE_ROW);
    mockFrom.mockReturnValueOnce(updateChain as any);

    await updateUser('user-1', { city: 'Seattle' }, { bypassNameLock: true });

    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('logs and still reports success when the audit insert fails', async () => {
    const beforeChain = singleChain(BASE_ROW);
    const updateChain = singleChain(BASE_ROW);
    const auditError = new Error('insert failed');
    const failingAuditChain = makeChain();
    failingAuditChain.resolveAs({ error: auditError });
    mockFrom
      .mockReturnValueOnce(beforeChain as any)
      .mockReturnValueOnce(updateChain as any)
      .mockReturnValueOnce(failingAuditChain as any);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await updateUser('user-1', { city: 'Seattle' }, { bypassNameLock: true, performedBy: 'mod-1' });
    expect(result.ok).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('user-1'), auditError);
    consoleErrorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// searchUsers
// ---------------------------------------------------------------------------

describe('searchUsers', () => {
  it('returns forbidden when caller is below moderator rank', async () => {
    mockFrom.mockReturnValue(singleChain({ role: 'venue_verifier' }) as any); // admin-role check

    const result = await searchUsers('caller-1', { q: 'ali' });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns matching users for a moderator+ caller, bypassing privacy', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'moderator' }) as any) // admin-role check
      .mockReturnValueOnce(arrayChain([{ ...BASE_ROW, privacy_level: 'private' }]) as any); // search query

    const result = await searchUsers('caller-1', { q: 'ali' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.users).toHaveLength(1);
    expect(result.ok && result.users[0].privacyLevel).toBe('private');
  });

  it('filters by exact id when provided', async () => {
    const searchChain = arrayChain([BASE_ROW]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any)
      .mockReturnValueOnce(searchChain as any);

    await searchUsers('caller-1', { id: 'user-1' });
    expect(searchChain['eq']).toHaveBeenCalledWith('id', 'user-1');
  });

  it('filters by display_name ILIKE when q is provided', async () => {
    const searchChain = arrayChain([BASE_ROW]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any)
      .mockReturnValueOnce(searchChain as any);

    await searchUsers('caller-1', { q: 'ali' });
    expect(searchChain['ilike']).toHaveBeenCalledWith('display_name', '%ali%');
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

// ---------------------------------------------------------------------------
// setVerifiedStatus
// ---------------------------------------------------------------------------

describe('setVerifiedStatus', () => {
  const VERIFIABLE_ROW = { ...BASE_ROW, first_name: 'Alice', last_name: 'Smith' };

  it('returns forbidden when caller is below admin rank', async () => {
    mockFrom.mockReturnValueOnce(singleChain({ role: 'moderator' }) as any); // role check

    const result = await setVerifiedStatus('caller-1', 'user-1', true);
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns not_found when the target does not exist', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any) // role check
      .mockReturnValueOnce(singleChain(null) as any); // profile fetch fails

    const result = await setVerifiedStatus('caller-1', 'user-1', true);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns name_required when verifying a user with no first/last name on file', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any) // role check
      .mockReturnValueOnce(singleChain(BASE_ROW) as any); // profile fetch — first_name/last_name null

    const result = await setVerifiedStatus('caller-1', 'user-1', true);
    expect(result).toEqual({ ok: false, reason: 'name_required' });
  });

  it('does not require a name when unverifying', async () => {
    const updateChain = singleChain({ ...BASE_ROW, verified_tier: null, rating_floor: null });
    const auditChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any) // role check
      .mockReturnValueOnce(singleChain(BASE_ROW) as any) // profile fetch — no name, but unverifying doesn't need one
      .mockReturnValueOnce(updateChain as any)
      .mockReturnValueOnce(auditChain as any);

    const result = await setVerifiedStatus('caller-1', 'user-1', false);
    expect(result.ok).toBe(true);
  });

  it('verifies a user: sets verified_tier and a 6.0 rating floor', async () => {
    const updateChain = singleChain({ ...VERIFIABLE_ROW, verified_tier: 8, rating_floor: 6.0 });
    const auditChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any) // role check
      .mockReturnValueOnce(singleChain(VERIFIABLE_ROW) as any) // profile fetch
      .mockReturnValueOnce(updateChain as any)
      .mockReturnValueOnce(auditChain as any);

    const result = await setVerifiedStatus('caller-1', 'user-1', true);
    expect(result).toEqual({
      ok: true,
      user: expect.objectContaining({ verifiedTier: 8, ratingFloor: 6.0 }),
    });
    expect(updateChain['update']).toHaveBeenCalledWith({ verified_tier: 8, rating_floor: 6.0 });
    expect(auditChain['insert']).toHaveBeenCalledWith({
      target_user_id: 'user-1',
      performed_by: 'caller-1',
      changes: [
        { field: 'verifiedTier', before: null, after: 8 },
        { field: 'ratingFloor', before: null, after: 6.0 },
      ],
    });
  });

  it('unverifies a user: clears verified_tier and rating_floor', async () => {
    const before = { ...VERIFIABLE_ROW, verified_tier: 8, rating_floor: 6.0 };
    const updateChain = singleChain({ ...VERIFIABLE_ROW, verified_tier: null, rating_floor: null });
    const auditChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any)
      .mockReturnValueOnce(singleChain(before) as any)
      .mockReturnValueOnce(updateChain as any)
      .mockReturnValueOnce(auditChain as any);

    const result = await setVerifiedStatus('caller-1', 'user-1', false);
    expect(result).toEqual({
      ok: true,
      user: expect.objectContaining({ verifiedTier: null, ratingFloor: null }),
    });
    expect(updateChain['update']).toHaveBeenCalledWith({ verified_tier: null, rating_floor: null });
    expect(auditChain['insert']).toHaveBeenCalledWith({
      target_user_id: 'user-1',
      performed_by: 'caller-1',
      changes: [
        { field: 'verifiedTier', before: 8, after: null },
        { field: 'ratingFloor', before: 6.0, after: null },
      ],
    });
  });

  it('omits the audit changes array (null) when nothing actually changed', async () => {
    const already = { ...VERIFIABLE_ROW, verified_tier: 8, rating_floor: 6.0 };
    const updateChain = singleChain(already);
    const auditChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any)
      .mockReturnValueOnce(singleChain(already) as any)
      .mockReturnValueOnce(updateChain as any)
      .mockReturnValueOnce(auditChain as any);

    await setVerifiedStatus('caller-1', 'user-1', true);
    expect(auditChain['insert']).toHaveBeenCalledWith({
      target_user_id: 'user-1',
      performed_by: 'caller-1',
      changes: null,
    });
  });

  it('logs and still reports success when the audit insert fails', async () => {
    const updateChain = singleChain({ ...VERIFIABLE_ROW, verified_tier: 8, rating_floor: 6.0 });
    const auditError = new Error('insert failed');
    const failingAuditChain = makeChain();
    failingAuditChain.resolveAs({ error: auditError });
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any)
      .mockReturnValueOnce(singleChain(VERIFIABLE_ROW) as any)
      .mockReturnValueOnce(updateChain as any)
      .mockReturnValueOnce(failingAuditChain as any);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await setVerifiedStatus('caller-1', 'user-1', true);
    expect(result.ok).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('user-1'), auditError);
    consoleErrorSpy.mockRestore();
  });
});
