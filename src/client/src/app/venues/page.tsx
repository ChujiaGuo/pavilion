'use client';

import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { AppShell } from '@/components/nav/app-shell';

export default function VenuesPage() {
  const auth = useRequireAuth();
  if (!auth) return null;

  return (
    <AppShell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Venues</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Nearby venues</h1>
      <p className="mt-6 text-neutral-600">Venue discovery is coming soon.</p>
    </AppShell>
  );
}
