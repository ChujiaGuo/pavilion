import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../../../lib/supabase.js';
import { listAdmins, setAdminRole, removeAdminRole, listAdminHistory } from '../admin.service.js';

function makeChain() {
  const chain: Record<string, any> = {};
  chain['select'] = vi.fn(() => chain);
  chain['eq'] = vi.fn(() => chain);
  chain['is'] = vi.fn(() => chain);
  chain['order'] = vi.fn(() => chain);
  chain['limit'] = vi.fn(() => chain);
  chain['insert'] = vi.fn(() => chain);
  chain['upsert'] = vi.fn(() => chain);
  chain['delete'] = vi.fn(() => chain);
  chain['single'] = vi.fn();
  chain['maybeSingle'] = vi.fn();
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

function maybeSingleChain(data: any) {
  const chain = makeChain();
  chain['maybeSingle'].mockResolvedValue({ data, error: null });
  return chain;
}

function arrayChain(data: any[]) {
  const chain = makeChain();
  chain.resolveAs({ data, error: null });
  return chain;
}

const mockFrom = vi.mocked(supabase.from);

const CALLER_ID = 'caller-1';
const TARGET_ID = 'target-1';

beforeEach(() => vi.clearAllMocks());

describe('listAdmins', () => {
  it('returns forbidden when caller is not owner', async () => {
    mockFrom.mockReturnValueOnce(singleChain({ role: 'admin' }) as any); // role check

    const result = await listAdmins(CALLER_ID);
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns the admin list for an owner caller', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any) // role check
      .mockReturnValueOnce(
        arrayChain([
          {
            user_id: TARGET_ID,
            role: 'moderator',
            granted_by: CALLER_ID,
            created_at: '2026-01-01T00:00:00Z',
            profiles: { display_name: 'Test Mod' },
          },
        ]) as any,
      );

    const result = await listAdmins(CALLER_ID);
    expect(result).toEqual({
      ok: true,
      admins: [
        {
          userId: TARGET_ID,
          displayName: 'Test Mod',
          role: 'moderator',
          grantedBy: CALLER_ID,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
  });
});

describe('setAdminRole', () => {
  it('returns forbidden when caller is not owner', async () => {
    mockFrom.mockReturnValueOnce(singleChain({ role: 'moderator' }) as any); // role check

    const result = await setAdminRole(CALLER_ID, TARGET_ID, 'admin');
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('grants a new role and writes an audit row', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any) // role check
      .mockReturnValueOnce(maybeSingleChain(null) as any) // existing role lookup (none)
      .mockReturnValueOnce(
        singleChain({
          user_id: TARGET_ID,
          role: 'moderator',
          granted_by: CALLER_ID,
          created_at: '2026-01-01T00:00:00Z',
          profiles: { display_name: 'Test Mod' },
        }) as any,
      ) // upsert result
      .mockReturnValueOnce(arrayChain([]) as any); // audit insert

    const result = await setAdminRole(CALLER_ID, TARGET_ID, 'moderator');
    expect(result).toEqual({
      ok: true,
      grant: {
        userId: TARGET_ID,
        displayName: 'Test Mod',
        role: 'moderator',
        grantedBy: CALLER_ID,
        createdAt: '2026-01-01T00:00:00Z',
      },
    });
  });

  it('records the previous role in the audit insert when replacing an existing grant', async () => {
    const auditChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any) // role check
      .mockReturnValueOnce(maybeSingleChain({ role: 'venue_verifier' }) as any) // existing role
      .mockReturnValueOnce(
        singleChain({
          user_id: TARGET_ID,
          role: 'admin',
          granted_by: CALLER_ID,
          created_at: '2026-01-01T00:00:00Z',
          profiles: { display_name: 'Test Mod' },
        }) as any,
      )
      .mockReturnValueOnce(auditChain as any);

    await setAdminRole(CALLER_ID, TARGET_ID, 'admin');
    expect(auditChain['insert']).toHaveBeenCalledWith(
      expect.objectContaining({ old_role: 'venue_verifier', new_role: 'admin', changed_by: CALLER_ID }),
    );
  });

  it('returns not_found when the upsert fails', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any)
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(singleChain(null) as any); // upsert fails

    const result = await setAdminRole(CALLER_ID, TARGET_ID, 'admin');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('logs and still reports success when the audit insert fails', async () => {
    const auditError = new Error('insert failed');
    const failingAuditChain = makeChain();
    failingAuditChain.resolveAs({ error: auditError });
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any)
      .mockReturnValueOnce(maybeSingleChain(null) as any)
      .mockReturnValueOnce(
        singleChain({
          user_id: TARGET_ID,
          role: 'moderator',
          granted_by: CALLER_ID,
          created_at: '2026-01-01T00:00:00Z',
          profiles: { display_name: 'Test Mod' },
        }) as any,
      )
      .mockReturnValueOnce(failingAuditChain as any);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await setAdminRole(CALLER_ID, TARGET_ID, 'moderator');
    expect(result.ok).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(TARGET_ID), auditError);
    consoleErrorSpy.mockRestore();
  });
});

describe('removeAdminRole', () => {
  it('returns forbidden when caller is not owner', async () => {
    mockFrom.mockReturnValueOnce(singleChain({ role: 'admin' }) as any);

    const result = await removeAdminRole(CALLER_ID, TARGET_ID);
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns not_found when the target has no role', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any)
      .mockReturnValueOnce(maybeSingleChain(null) as any); // no existing role

    const result = await removeAdminRole(CALLER_ID, TARGET_ID);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('removes the role and writes an audit row', async () => {
    const deleteChain = arrayChain([]);
    const auditChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any) // role check
      .mockReturnValueOnce(maybeSingleChain({ role: 'moderator' }) as any) // existing role
      .mockReturnValueOnce(deleteChain as any) // delete
      .mockReturnValueOnce(auditChain as any); // audit insert

    const result = await removeAdminRole(CALLER_ID, TARGET_ID);
    expect(result).toEqual({ ok: true });
    expect(auditChain['insert']).toHaveBeenCalledWith(
      expect.objectContaining({ old_role: 'moderator', new_role: null, changed_by: CALLER_ID }),
    );
  });

  it('logs and still reports success when the audit insert fails', async () => {
    const deleteChain = arrayChain([]);
    const auditError = new Error('insert failed');
    const failingAuditChain = makeChain();
    failingAuditChain.resolveAs({ error: auditError });
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any)
      .mockReturnValueOnce(maybeSingleChain({ role: 'moderator' }) as any)
      .mockReturnValueOnce(deleteChain as any)
      .mockReturnValueOnce(failingAuditChain as any);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await removeAdminRole(CALLER_ID, TARGET_ID);
    expect(result).toEqual({ ok: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(TARGET_ID), auditError);
    consoleErrorSpy.mockRestore();
  });
});

describe('listAdminHistory', () => {
  it('returns forbidden when the caller has no admin role at all', async () => {
    mockFrom.mockReturnValueOnce(singleChain(null) as any); // role check

    const result = await listAdminHistory(CALLER_ID);
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('a venue_verifier caller sees only venue edits', async () => {
    const venueChain = arrayChain([
      {
        id: 've-1',
        action: 'create',
        created_at: '2026-01-01T00:00:00Z',
        venues: { name: 'City Rec Center' },
        performer: { display_name: 'Verifier' },
      },
    ]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'venue_verifier' }) as any) // role check
      .mockReturnValueOnce(venueChain as any); // fetchVenueEditEntries — the only source

    const result = await listAdminHistory(CALLER_ID);
    expect(result.ok).toBe(true);
    expect(result.ok && result.entries).toEqual([
      {
        id: 've-1',
        domain: 'venue',
        action: 'create',
        targetLabel: 'City Rec Center',
        performedByDisplayName: 'Verifier',
        createdAt: '2026-01-01T00:00:00Z',
        changes: null,
      },
    ]);
    // Exactly 2 from() calls: the role check + the single venue-edits query.
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('a moderator caller sees venue + user + session edits, but not rating or role entries', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'moderator' }) as any) // role check
      .mockReturnValueOnce(arrayChain([]) as any) // venue edits
      .mockReturnValueOnce(
        arrayChain([
          {
            id: 'ue-1',
            created_at: '2026-01-01T00:00:00Z',
            target: { display_name: 'Target User' },
            performer: { display_name: 'Mod' },
          },
        ]) as any,
      ) // user edits
      .mockReturnValueOnce(
        arrayChain([
          {
            id: 'se-1',
            action: 'cancel',
            created_at: '2026-01-02T00:00:00Z',
            sessions: { venue_name: 'City Rec Center' },
            performer: { display_name: 'Mod' },
          },
        ]) as any,
      ); // session edits

    const result = await listAdminHistory(CALLER_ID);
    expect(result.ok).toBe(true);
    const domains = result.ok ? result.entries.map((e) => e.domain) : [];
    expect(domains.sort()).toEqual(['session', 'user']);
    expect(mockFrom).toHaveBeenCalledTimes(4); // role check + venue + user + session
  });

  it('an admin caller additionally sees rating-adjustment entries', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any) // role check
      .mockReturnValueOnce(arrayChain([]) as any) // venue edits
      .mockReturnValueOnce(arrayChain([]) as any) // user edits
      .mockReturnValueOnce(arrayChain([]) as any) // session edits
      .mockReturnValueOnce(
        arrayChain([
          {
            id: 'rh-1',
            created_at: '2026-01-01T00:00:00Z',
            score_before: 5.0,
            score_after: 6.0,
            target: { display_name: 'Rated User' },
            performer: { display_name: 'Admin' },
          },
        ]) as any,
      ); // rating adjustments

    const result = await listAdminHistory(CALLER_ID);
    expect(result.ok).toBe(true);
    expect(result.ok && result.entries).toEqual([
      {
        id: 'rh-1',
        domain: 'rating',
        action: 'adjust_rating',
        targetLabel: 'Rated User',
        performedByDisplayName: 'Admin',
        createdAt: '2026-01-01T00:00:00Z',
        changes: [{ field: 'score', before: 5.0, after: 6.0 }],
      },
    ]);
    expect(mockFrom).toHaveBeenCalledTimes(5); // role check + venue + user + session + rating
  });

  it('an owner caller additionally sees role-change entries', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any) // role check
      .mockReturnValueOnce(arrayChain([]) as any) // venue edits
      .mockReturnValueOnce(arrayChain([]) as any) // user edits
      .mockReturnValueOnce(arrayChain([]) as any) // session edits
      .mockReturnValueOnce(arrayChain([]) as any) // rating adjustments
      .mockReturnValueOnce(
        arrayChain([
          {
            id: 'rc-1',
            old_role: 'moderator',
            new_role: 'admin',
            created_at: '2026-01-01T00:00:00Z',
            target: { display_name: 'Promoted User' },
            changer: { display_name: 'Owner' },
          },
        ]) as any,
      ); // role changes

    const result = await listAdminHistory(CALLER_ID);
    expect(result.ok).toBe(true);
    expect(result.ok && result.entries).toEqual([
      {
        id: 'rc-1',
        domain: 'role',
        action: 'change_role',
        targetLabel: 'Promoted User',
        performedByDisplayName: 'Owner',
        createdAt: '2026-01-01T00:00:00Z',
        changes: [{ field: 'role', before: 'moderator', after: 'admin' }],
      },
    ]);
    expect(mockFrom).toHaveBeenCalledTimes(6); // role check + all 5 sources
  });

  it('derives grant/revoke/change_role labels from old_role/new_role', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any)
      .mockReturnValueOnce(arrayChain([]) as any)
      .mockReturnValueOnce(arrayChain([]) as any)
      .mockReturnValueOnce(arrayChain([]) as any)
      .mockReturnValueOnce(arrayChain([]) as any)
      .mockReturnValueOnce(
        arrayChain([
          {
            id: 'rc-grant',
            old_role: null,
            new_role: 'moderator',
            created_at: '2026-01-01T00:00:00Z',
            target: { display_name: 'A' },
            changer: { display_name: 'Owner' },
          },
          {
            id: 'rc-revoke',
            old_role: 'moderator',
            new_role: null,
            created_at: '2026-01-02T00:00:00Z',
            target: { display_name: 'B' },
            changer: { display_name: 'Owner' },
          },
        ]) as any,
      );

    const result = await listAdminHistory(CALLER_ID);
    const byId = result.ok ? Object.fromEntries(result.entries.map((e) => [e.id, e.action])) : {};
    expect(byId['rc-grant']).toBe('grant');
    expect(byId['rc-revoke']).toBe('revoke');
  });

  it('merges all sources, sorts newest first, and caps the total', async () => {
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'owner' }) as any)
      .mockReturnValueOnce(
        arrayChain([
          {
            id: 've-old',
            action: 'edit',
            created_at: '2026-01-01T00:00:00Z',
            venues: { name: 'Venue' },
            performer: { display_name: 'V' },
          },
        ]) as any,
      ) // venue edits
      .mockReturnValueOnce(arrayChain([]) as any) // user edits
      .mockReturnValueOnce(
        arrayChain([
          {
            id: 'se-new',
            action: 'edit',
            created_at: '2026-01-03T00:00:00Z',
            sessions: { venue_name: 'Session Venue' },
            performer: { display_name: 'S' },
          },
        ]) as any,
      ) // session edits
      .mockReturnValueOnce(arrayChain([]) as any) // rating adjustments
      .mockReturnValueOnce(
        arrayChain([
          {
            id: 'rc-mid',
            old_role: 'moderator',
            new_role: 'admin',
            created_at: '2026-01-02T00:00:00Z',
            target: { display_name: 'T' },
            changer: { display_name: 'O' },
          },
        ]) as any,
      ); // role changes

    const result = await listAdminHistory(CALLER_ID);
    expect(result.ok).toBe(true);
    expect(result.ok && result.entries.map((e) => e.id)).toEqual(['se-new', 'rc-mid', 've-old']);
  });

  it('caps each source query at 50 rows', async () => {
    const venueChain = arrayChain([]);
    mockFrom.mockReturnValueOnce(singleChain({ role: 'venue_verifier' }) as any).mockReturnValueOnce(venueChain as any);

    await listAdminHistory(CALLER_ID);
    expect(venueChain['limit']).toHaveBeenCalledWith(50);
  });

  it('queries rating_history filtered to session_id IS NULL for rating-adjustment entries', async () => {
    const ratingChain = arrayChain([]);
    mockFrom
      .mockReturnValueOnce(singleChain({ role: 'admin' }) as any)
      .mockReturnValueOnce(arrayChain([]) as any) // venue
      .mockReturnValueOnce(arrayChain([]) as any) // user
      .mockReturnValueOnce(arrayChain([]) as any) // session
      .mockReturnValueOnce(ratingChain as any); // rating

    await listAdminHistory(CALLER_ID);
    expect(ratingChain['is']).toHaveBeenCalledWith('session_id', null);
  });
});
