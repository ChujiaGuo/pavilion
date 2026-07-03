import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('../../../lib/admin.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/admin.js')>('../../../lib/admin.js');
  return { ...actual, getAdminRole: vi.fn() };
});

vi.mock('../admin.service.js', () => ({
  listAdmins: vi.fn(),
  setAdminRole: vi.fn(),
  removeAdminRole: vi.fn(),
  listAdminHistory: vi.fn(),
}));

import { supabase } from '../../../lib/supabase.js';
import { getAdminRole } from '../../../lib/admin.js';
import { listAdmins, setAdminRole, removeAdminRole, listAdminHistory } from '../admin.service.js';
import { adminRouter } from '../admin.router.js';

const mockGetUser = vi.mocked(supabase.auth.getUser);
const mockGetAdminRole = vi.mocked(getAdminRole);
const mockListAdmins = vi.mocked(listAdmins);
const mockSetAdminRole = vi.mocked(setAdminRole);
const mockRemoveAdminRole = vi.mocked(removeAdminRole);
const mockListAdminHistory = vi.mocked(listAdminHistory);

const USER_ID = 'user-1';
const TOKEN = 'valid-token';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null } as any);
});

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}` };
}

describe('GET /me', () => {
  it('returns the caller role', async () => {
    mockGetAdminRole.mockResolvedValue('moderator');

    const res = await adminRouter.request('/me', { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'moderator' });
  });

  it('returns null when the caller has no role', async () => {
    mockGetAdminRole.mockResolvedValue(null);

    const res = await adminRouter.request('/me', { headers: authHeaders() });
    expect(await res.json()).toEqual({ role: null });
  });

  it('returns 401 without a bearer token', async () => {
    const res = await adminRouter.request('/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /roles', () => {
  it('returns 403 when the service reports forbidden', async () => {
    mockListAdmins.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const res = await adminRouter.request('/roles', { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it('returns the admin list on success', async () => {
    const admins = [{ userId: 'u1', displayName: 'A', role: 'admin' as const, grantedBy: null, createdAt: 'x' }];
    mockListAdmins.mockResolvedValue({ ok: true, admins });

    const res = await adminRouter.request('/roles', { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ admins });
  });
});

describe('PATCH /roles/:userId', () => {
  it('returns 400 for an invalid role', async () => {
    const res = await adminRouter.request('/roles/target-1', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'superadmin' }),
    });
    expect(res.status).toBe(400);
    expect(mockSetAdminRole).not.toHaveBeenCalled();
  });

  it('returns 403 when the service reports forbidden', async () => {
    mockSetAdminRole.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const res = await adminRouter.request('/roles/target-1', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'moderator' }),
    });
    expect(res.status).toBe(403);
  });

  it('grants the role on success', async () => {
    const grant = { userId: 'target-1', displayName: 'Target', role: 'moderator' as const, grantedBy: USER_ID, createdAt: 'x' };
    mockSetAdminRole.mockResolvedValue({ ok: true, grant });

    const res = await adminRouter.request('/roles/target-1', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'moderator' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(grant);
    expect(mockSetAdminRole).toHaveBeenCalledWith(USER_ID, 'target-1', 'moderator');
  });
});

describe('DELETE /roles/:userId', () => {
  it('returns 403 when the service reports forbidden', async () => {
    mockRemoveAdminRole.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const res = await adminRouter.request('/roles/target-1', { method: 'DELETE', headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the target has no role', async () => {
    mockRemoveAdminRole.mockResolvedValue({ ok: false, reason: 'not_found' });

    const res = await adminRouter.request('/roles/target-1', { method: 'DELETE', headers: authHeaders() });
    expect(res.status).toBe(404);
  });

  it('removes the role on success', async () => {
    mockRemoveAdminRole.mockResolvedValue({ ok: true });

    const res = await adminRouter.request('/roles/target-1', { method: 'DELETE', headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});

describe('GET /history', () => {
  it('returns 401 without a bearer token', async () => {
    const res = await adminRouter.request('/history');
    expect(res.status).toBe(401);
  });

  it('returns 403 when the service reports forbidden', async () => {
    mockListAdminHistory.mockResolvedValue({ ok: false, reason: 'forbidden' });

    const res = await adminRouter.request('/history', { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it('returns the merged history feed on success', async () => {
    const entries = [
      {
        id: 'entry-1',
        domain: 'venue' as const,
        action: 'create',
        targetLabel: 'City Rec Center',
        performedByDisplayName: 'Verifier',
        createdAt: 'x',
      },
    ];
    mockListAdminHistory.mockResolvedValue({ ok: true, entries });

    const res = await adminRouter.request('/history', { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries });
    expect(mockListAdminHistory).toHaveBeenCalledWith(USER_ID);
  });
});
