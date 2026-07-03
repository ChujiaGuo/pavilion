'use client';

import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { apiGet } from '@/lib/api';
import { AppShell } from '@/components/nav/app-shell';
import { roleAtLeast } from '@/lib/admin-role';
import { AdminVenuesPanel } from '@/components/admin/admin-venues-panel';
import { AdminUsersPanel } from '@/components/admin/admin-users-panel';
import { AdminSessionsPanel } from '@/components/admin/admin-sessions-panel';
import { AdminVerificationPanel } from '@/components/admin/admin-verification-panel';
import { AdminRolesPanel } from '@/components/admin/admin-roles-panel';
import { AdminHistoryPanel } from '@/components/admin/admin-history-panel';
import { cn } from '@/lib/utils';
import type { AdminRole } from '@pavilion/types';

type Tab = 'venues' | 'users' | 'sessions' | 'verification' | 'roles' | 'history';

// Ratings deliberately isn't its own tab — adjusting a user's rating always
// starts with finding that user, which the Users tab already does. Folding
// rating-adjust into that same edit view (gated to admin+ inside
// AdminUsersPanel) avoids making an admin search for the same person twice.
//
// History's minRole is venue_verifier (the floor rank) even though its own
// content is scoped tighter per entry type — the endpoint itself only 403s
// for a caller with no admin role at all, so every admin should see the tab;
// what they see inside it is scoped server-side (listAdminHistory).
const TABS: { id: Tab; label: string; minRole: AdminRole }[] = [
  { id: 'venues', label: 'Venues', minRole: 'venue_verifier' },
  { id: 'users', label: 'Users', minRole: 'moderator' },
  { id: 'sessions', label: 'Sessions', minRole: 'moderator' },
  { id: 'verification', label: 'Verification', minRole: 'admin' },
  { id: 'roles', label: 'Roles', minRole: 'owner' },
  { id: 'history', label: 'History', minRole: 'venue_verifier' },
];

export default function AdminPage() {
  const auth = useRequireAuth();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    if (!auth) return;
    apiGet<{ role: AdminRole | null }>('/api/admin/me', auth.accessToken)
      .then((res) => setRole(res.role))
      .catch(() => setRole(null))
      .finally(() => setIsLoading(false));
  }, [auth]);

  const visibleTabs = TABS.filter((t) => roleAtLeast(role, t.minRole));

  useEffect(() => {
    if (tab === null && visibleTabs.length > 0) setTab(visibleTabs[0].id);
  }, [visibleTabs, tab]);

  if (!auth) return null;

  return (
    <AppShell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Admin</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Admin & Moderation</h1>

      {isLoading ? (
        <p className="mt-8 text-neutral-500">Loading…</p>
      ) : visibleTabs.length === 0 ? (
        <p className="mt-8 text-neutral-500">You don&apos;t have access to any admin tools.</p>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-6 border-b border-border">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'border-b-2 pb-3 text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-8">
            {tab === 'venues' && <AdminVenuesPanel accessToken={auth.accessToken} />}
            {tab === 'users' && <AdminUsersPanel accessToken={auth.accessToken} role={role} />}
            {tab === 'sessions' && <AdminSessionsPanel accessToken={auth.accessToken} />}
            {tab === 'verification' && <AdminVerificationPanel />}
            {tab === 'roles' && <AdminRolesPanel accessToken={auth.accessToken} />}
            {tab === 'history' && <AdminHistoryPanel accessToken={auth.accessToken} />}
          </div>
        </>
      )}
    </AppShell>
  );
}
