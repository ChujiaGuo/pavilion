'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { apiGet } from '@/lib/api';
import { AppShell } from '@/components/nav/app-shell';
import type { Session } from '@pavilion/types';

function byStartsAt(direction: 'asc' | 'desc') {
  return (a: Session, b: Session) => {
    const diff = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    return direction === 'asc' ? diff : -diff;
  };
}

function formatSessionTime(startsAt: string) {
  return new Date(startsAt).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HomePage() {
  const auth = useRequireAuth();
  const [nextSession, setNextSession] = useState<Session | null>(null);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!auth) return;
    const { accessToken, userId } = auth;

    async function load() {
      try {
        const [attending, organizing, completed] = await Promise.all([
          apiGet<{ sessions: Session[] }>(
            `/api/sessions?attendee_id=${userId}&status=upcoming`,
            accessToken
          ),
          apiGet<{ sessions: Session[] }>(
            `/api/sessions?organizer_id=${userId}&status=upcoming`,
            accessToken
          ),
          apiGet<{ sessions: Session[] }>(
            `/api/sessions?attendee_id=${userId}&status=completed`,
            accessToken
          ),
        ]);

        const upcoming = [...attending.sessions, ...organizing.sessions].sort(byStartsAt('asc'));
        setNextSession(upcoming[0] ?? null);
        setRecentSessions(completed.sessions.sort(byStartsAt('desc')).slice(0, 5));
      } catch {
        // Widgets degrade to their empty states rather than blocking the page.
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [auth]);

  if (!auth) return null;

  return (
    <AppShell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Home</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Your dashboard</h1>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
          Next session
        </h2>
        {isLoading ? (
          <p className="mt-3 text-neutral-500">Loading…</p>
        ) : nextSession ? (
          <Link
            href={`/sessions/${nextSession.id}`}
            className="mt-3 block rounded-2xl border border-border p-5 transition-shadow hover:shadow-md"
          >
            <p className="text-lg font-semibold">{nextSession.venueName}</p>
            <p className="mt-1 text-neutral-600">{formatSessionTime(nextSession.startsAt)}</p>
          </Link>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-5">
            <p className="text-neutral-600">You don&apos;t have a session lined up yet.</p>
            <Link
              href="/sessions"
              className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-md transition-shadow hover:shadow-lg"
            >
              Find your next session
            </Link>
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
          Recent activity
        </h2>
        {isLoading ? (
          <p className="mt-3 text-neutral-500">Loading…</p>
        ) : recentSessions.length > 0 ? (
          <ul className="mt-3 divide-y divide-border">
            {recentSessions.map((session) => (
              <li key={session.id}>
                <Link href={`/sessions/${session.id}`} className="block py-3">
                  <p className="font-medium">{session.venueName}</p>
                  <p className="text-sm text-neutral-500">{formatSessionTime(session.startsAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-neutral-500">No sessions played yet.</p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
          Friends activity
        </h2>
        <div className="mt-3 rounded-2xl border border-dashed border-border p-5 text-neutral-500">
          Coming soon — follow players to see their activity here.
        </div>
      </section>
    </AppShell>
  );
}
