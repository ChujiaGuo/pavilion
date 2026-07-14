'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RequiredMarker } from '@/components/ui/required-marker';
import { apiGet, apiPatch, apiDelete, apiPost, apiErrorMessage } from '@/lib/api';
import { SESSION_STATUS_LABELS } from '@/lib/session-format';
import { cn } from '@/lib/utils';
import type { Session, SessionRsvp, SessionStatus } from '@pavilion/types';

const STATUS_OPTIONS: SessionStatus[] = ['upcoming', 'active', 'completed', 'cancelled'];

// Same debounce shape as session-filters.tsx's SessionFilters — one shared
// timer covering both the text query and the status pill, no explicit
// Search button.
const SEARCH_DEBOUNCE_MS = 400;

const RSVP_STATUS_LABELS: Record<SessionRsvp['status'], string> = {
  going: 'Going',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
  attended: 'Attended',
  no_show: 'No-show',
};

interface EditFields {
  venueName: string;
  skillMin: string;
  skillMax: string;
  courtCount: string;
  maxPlayers: string;
  notes: string;
}

function toEditFields(session: Session): EditFields {
  return {
    venueName: session.venueName,
    skillMin: String(session.skillMin),
    skillMax: String(session.skillMax),
    courtCount: String(session.courtCount),
    maxPlayers: String(session.maxPlayers),
    notes: session.notes ?? '',
  };
}

export function AdminSessionsPanel({ accessToken }: { accessToken: string }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SessionStatus>('upcoming');
  const [results, setResults] = useState<Session[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const lastSearchedRef = useRef<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fields, setFields] = useState<EditFields | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [players, setPlayers] = useState<SessionRsvp[] | null>(null);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  useEffect(() => {
    const serialized = JSON.stringify({ query, status });
    if (serialized === lastSearchedRef.current) return;
    const timeout = setTimeout(async () => {
      lastSearchedRef.current = serialized;
      setSearchError(null);
      try {
        const trimmed = query.trim();
        const params = new URLSearchParams({ admin: 'true', status });
        if (trimmed) params.set('name', trimmed);
        const { sessions } = await apiGet<{ sessions: Session[] }>(`/api/sessions?${params.toString()}`, accessToken);
        setResults(sessions);
      } catch {
        setSearchError('Search failed.');
        setResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, status, accessToken]);

  function refreshOne(updated: Session) {
    setResults((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function startEditing(session: Session) {
    setEditingId(session.id);
    setFields(toEditFields(session));
    setActionError(null);

    setPlayers(null);
    setPlayersError(null);
    setIsLoadingPlayers(true);
    apiGet<{ rsvps: SessionRsvp[] }>(`/api/sessions/${session.id}/rsvps?admin=true`, accessToken)
      .then((res) => setPlayers(res.rsvps))
      .catch(() => setPlayersError('Failed to load players.'))
      .finally(() => setIsLoadingPlayers(false));
  }

  // Removal is restricted to upcoming sessions server-side too (removeRsvp) —
  // active/completed sessions have real attendance history that removing a
  // player would silently rewrite, so the row simply has no Remove button
  // once a session progresses past upcoming.
  async function handleRemovePlayer(session: Session, userId: string) {
    setPlayersError(null);
    setRemovingUserId(userId);
    try {
      await apiDelete(`/api/sessions/${session.id}/rsvps/${userId}`, accessToken);
      setPlayers((prev) => prev && prev.filter((p) => p.userId !== userId));
    } catch (err) {
      setPlayersError(apiErrorMessage(err, 'Failed to remove player.'));
    } finally {
      setRemovingUserId(null);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!fields || !editingId) return;
    setIsSaving(true);
    setActionError(null);
    try {
      const updated = await apiPatch<Session>(`/api/sessions/${editingId}`, accessToken, {
        venueName: fields.venueName,
        skillMin: Number(fields.skillMin),
        skillMax: Number(fields.skillMax),
        courtCount: Number(fields.courtCount),
        maxPlayers: Number(fields.maxPlayers),
        notes: fields.notes || null,
      });
      refreshOne(updated);
      setEditingId(null);
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to save changes.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancel(session: Session) {
    setActionError(null);
    try {
      await apiDelete(`/api/sessions/${session.id}`, accessToken);
      refreshOne({ ...session, status: 'cancelled' });
    } catch {
      setActionError('Failed to cancel session.');
    }
  }

  async function handleAdvanceStatus(session: Session) {
    setActionError(null);
    try {
      const updated = await apiPatch<Session>(`/api/sessions/${session.id}/status`, accessToken, {});
      refreshOne(updated);
    } catch {
      setActionError('Failed to advance status.');
    }
  }

  // Marks every currently-going RSVP as attended (no no-shows) — a minimal
  // moderator action rather than a full per-attendee attendance checklist,
  // which is a larger UI this page doesn't build out.
  async function handleMarkAllAttended(session: Session) {
    setActionError(null);
    try {
      const { rsvps } = await apiGet<{ rsvps: SessionRsvp[] }>(`/api/sessions/${session.id}/rsvps`, accessToken);
      const goingIds = rsvps.filter((r) => r.status === 'going').map((r) => r.userId);
      await apiPost(`/api/sessions/${session.id}/attendance`, accessToken, { attendedUserIds: goingIds });
    } catch {
      setActionError('Failed to mark attendance.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Input
          type="text"
          placeholder="Search by venue name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                status === s ? 'bg-primary/10 text-primary' : 'text-neutral-500 hover:bg-muted',
              )}
            >
              {SESSION_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {searchError && <p className="text-sm text-destructive">{searchError}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <ul className="divide-y divide-border">
        {results.map((session) => (
          <li key={session.id}>
            {editingId === session.id && fields ? (
              <div className="max-w-sm space-y-6 py-4">
                <p className="text-xs text-neutral-500">
                  Session ID: <span className="font-mono">{session.id}</span>
                </p>

                <form onSubmit={handleSave} className="space-y-4">
                  <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <RequiredMarker /> indicates a required field
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor={`venueName-${session.id}`}>
                      Venue name
                      <RequiredMarker />
                    </Label>
                    <Input
                      id={`venueName-${session.id}`}
                      required
                      value={fields.venueName}
                      onChange={(e) => setFields({ ...fields, venueName: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`skillMin-${session.id}`}>
                        Skill min
                        <RequiredMarker />
                      </Label>
                      <Input
                        id={`skillMin-${session.id}`}
                        type="number"
                        step="0.25"
                        required
                        value={fields.skillMin}
                        onChange={(e) => setFields({ ...fields, skillMin: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`skillMax-${session.id}`}>
                        Skill max
                        <RequiredMarker />
                      </Label>
                      <Input
                        id={`skillMax-${session.id}`}
                        type="number"
                        step="0.25"
                        required
                        value={fields.skillMax}
                        onChange={(e) => setFields({ ...fields, skillMax: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`courtCount-${session.id}`}>
                        Court count
                        <RequiredMarker />
                      </Label>
                      <Input
                        id={`courtCount-${session.id}`}
                        type="number"
                        min="1"
                        required
                        value={fields.courtCount}
                        onChange={(e) => setFields({ ...fields, courtCount: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`maxPlayers-${session.id}`}>
                        Max players
                        <RequiredMarker />
                      </Label>
                      <Input
                        id={`maxPlayers-${session.id}`}
                        type="number"
                        min="1"
                        required
                        value={fields.maxPlayers}
                        onChange={(e) => setFields({ ...fields, maxPlayers: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`notes-${session.id}`}>Notes</Label>
                    <Input
                      id={`notes-${session.id}`}
                      value={fields.notes}
                      onChange={(e) => setFields({ ...fields, notes: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? 'Saving…' : 'Save changes'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>

                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">Players</p>
                  {isLoadingPlayers ? (
                    <p className="text-sm text-neutral-500">Loading players…</p>
                  ) : players && players.length > 0 ? (
                    <ul className="space-y-2">
                      {players.map((p) => (
                        <li key={p.userId} className="flex items-center justify-between gap-3 text-sm">
                          <div>
                            <p className="font-medium">{p.displayName ?? p.userId}</p>
                            <p className="text-xs text-neutral-500">{RSVP_STATUS_LABELS[p.status]}</p>
                          </div>
                          {session.status === 'upcoming' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={removingUserId === p.userId}
                              onClick={() => handleRemovePlayer(session, p.userId)}
                            >
                              {removingUserId === p.userId ? 'Removing…' : 'Remove'}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-neutral-500">No players.</p>
                  )}
                  {playersError && <p className="text-sm text-destructive">{playersError}</p>}
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => startEditing(session)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    startEditing(session);
                  }
                }}
                className="-mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
              >
                <div>
                  <p className="text-sm font-medium">{session.venueName}</p>
                  <p className="text-xs text-neutral-500">
                    {session.status} · skill {session.skillMin}–{session.skillMax} · {session.visibility}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {(session.status === 'upcoming' || session.status === 'active') && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdvanceStatus(session);
                      }}
                    >
                      Advance status
                    </Button>
                  )}
                  {session.status === 'completed' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAllAttended(session);
                      }}
                    >
                      Mark all attended
                    </Button>
                  )}
                  {session.status === 'upcoming' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancel(session);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-neutral-400" />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
