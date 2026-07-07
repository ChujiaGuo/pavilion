'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { apiGet } from '@/lib/api';
import { AppShell } from '@/components/nav/app-shell';
import { SessionCard } from '@/components/session/session-card';
import { SessionFilters, type BrowseFilters, type SkillDefaults } from '@/components/session/session-filters';
import {
  SESSION_STATUS_LABELS,
  computeDefaultSkillRange,
  FALLBACK_SKILL_RANGE,
  todayIso,
  endOfDayIso,
  isSessionId,
} from '@/lib/session-format';
import type { Session, SessionStatus, RatingDisplay } from '@pavilion/types';
import { cn } from '@/lib/utils';

type Tab = 'browse' | 'hosting' | 'attending';

const TABS: { id: Tab; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'hosting', label: 'Hosting' },
  { id: 'attending', label: 'Attending' },
];

const STATUS_OPTIONS: SessionStatus[] = ['upcoming', 'completed', 'cancelled'];

export default function SessionsPage() {
  const auth = useRequireAuth();
  const [tab, setTab] = useState<Tab>('browse');
  const [status, setStatus] = useState<SessionStatus>('upcoming');
  const [skillDefaults, setSkillDefaults] = useState<SkillDefaults | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<BrowseFilters | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Skill filter defaults are computed once from the signed-in user's own
  // rating (mirrors joinSession's asymmetric RSVP tolerance — see
  // session-format.ts's computeDefaultSkillRange) rather than a fixed global
  // range, so Browse opens already roughly scoped to sessions this user
  // could actually join. Falls back to the full unverified-ceiling range if
  // the rating fetch fails; this page is auth-gated, so a signed-out viewer
  // never reaches this branch.
  useEffect(() => {
    if (!auth) return;
    apiGet<{ rating: RatingDisplay }>(`/api/ratings/user/${auth.userId}`, auth.accessToken)
      .then(({ rating }) => {
        const defaults = computeDefaultSkillRange(rating.grade);
        setSkillDefaults(defaults);
        setAppliedFilters({ search: '', dateFrom: todayIso(), dateTo: '', venueId: '', venueName: '', ...defaults });
      })
      .catch(() => {
        setSkillDefaults(FALLBACK_SKILL_RANGE);
        setAppliedFilters({
          search: '',
          dateFrom: todayIso(),
          dateTo: '',
          venueId: '',
          venueName: '',
          ...FALLBACK_SKILL_RANGE,
        });
      });
  }, [auth]);

  useEffect(() => {
    if (!auth) return;
    if (tab === 'browse' && appliedFilters === null) return;
    const { accessToken, userId } = auth;

    const params = new URLSearchParams({ status });
    if (tab === 'hosting') params.set('organizer_id', userId);
    if (tab === 'attending') params.set('attendee_id', userId);
    if (tab === 'browse' && appliedFilters) {
      const search = appliedFilters.search.trim();
      if (search) params.set(isSessionId(search) ? 'id' : 'name', search);
      if (appliedFilters.skillMin) params.set('skill_min', appliedFilters.skillMin);
      if (appliedFilters.skillMax) params.set('skill_max', appliedFilters.skillMax);
      if (appliedFilters.venueId) params.set('venue_id', appliedFilters.venueId);
      if (appliedFilters.dateFrom) params.set('date_from', new Date(appliedFilters.dateFrom).toISOString());
      if (appliedFilters.dateTo) params.set('date_to', endOfDayIso(appliedFilters.dateTo));
    }

    setIsLoading(true);
    apiGet<{ sessions: Session[] }>(`/api/sessions?${params.toString()}`, accessToken)
      .then((res) => setSessions(res.sessions))
      .catch(() => setSessions([]))
      .finally(() => setIsLoading(false));
  }, [auth, tab, status, appliedFilters]);

  if (!auth) return null;

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Sessions</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Find a session</h1>
        </div>
        <Link
          href="/sessions/new"
          className="mt-2 shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-md transition-shadow hover:shadow-lg"
        >
          Host a session
        </Link>
      </div>

      <div className="mt-8 flex items-center gap-6 border-b border-border">
        {TABS.map((t) => (
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              status === s ? 'bg-primary/10 text-primary' : 'text-neutral-500 hover:bg-muted',
            )}
          >
            {SESSION_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <div className="mt-6">
          {appliedFilters && skillDefaults ? (
            <SessionFilters
              value={appliedFilters}
              skillDefaults={skillDefaults}
              onApply={setAppliedFilters}
              accessToken={auth.accessToken}
            />
          ) : (
            <p className="text-sm text-neutral-500">Loading filters…</p>
          )}
        </div>
      )}

      <div className="mt-8">
        {isLoading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : sessions.length > 0 ? (
          <div>
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <p className="text-neutral-500">
            {tab === 'browse'
              ? 'No sessions match these filters.'
              : tab === 'hosting'
                ? "You aren't hosting any sessions yet."
                : "You don't have any sessions here yet."}
          </p>
        )}
      </div>
    </AppShell>
  );
}
