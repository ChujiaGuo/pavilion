'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Share2 } from 'lucide-react';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '@/lib/api';
import { AppShell } from '@/components/nav/app-shell';
import { Button } from '@/components/ui/button';
import {
  SessionFormFields,
  type SessionFormValues,
} from '@/components/session/session-form-fields';
import {
  SESSION_TYPE_LABELS,
  SESSION_FORMAT_LABELS,
  SESSION_VISIBILITY_LABELS,
  SHUTTLE_POLICY_LABELS,
  SESSION_STATUS_LABELS,
  formatSessionDateTime,
  formatSkillRange,
  toDatetimeLocalValue,
} from '@/lib/session-format';
import type { Session, SessionRsvp } from '@pavilion/types';

type MyRsvpStatus = 'going' | 'waitlisted' | 'attended' | 'no_show';
interface MyRsvp {
  status: MyRsvpStatus;
  joinedAt: string;
  waitlistPosition?: number;
}

// GET /api/sessions/:id additionally resolves the organizer's display name
// server-side (gated the same way getSessionRsvps gates attendee names —
// see technical-notes.md's Privacy section) so this page doesn't need its
// own per-user name fan-out.
type SessionDetail = Session & { organizerName: string | null };

const HOURS_12_MS = 12 * 60 * 60 * 1000;

function sessionToFormValues(session: Session): SessionFormValues {
  return {
    venueId: '',
    venueName: session.venueName,
    type: session.type,
    format: session.format,
    visibility: session.visibility,
    skillMin: String(session.skillMin),
    skillMax: String(session.skillMax),
    courtCount: String(session.courtCount),
    maxPlayers: String(session.maxPlayers),
    startsAt: toDatetimeLocalValue(session.startsAt),
    durationMinutes: String(session.durationMinutes),
    shuttlePolicy: session.shuttlePolicy,
    shuttleTubePrice: session.shuttleTubePrice != null ? String(session.shuttleTubePrice) : '',
    notes: session.notes ?? '',
  };
}

export default function SessionDetailPage() {
  const auth = useRequireAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [rsvps, setRsvps] = useState<SessionRsvp[]>([]);
  const [myRsvp, setMyRsvp] = useState<MyRsvp | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinWarning, setJoinWarning] = useState<string | null>(null);

  const [confirmingCancelRsvp, setConfirmingCancelRsvp] = useState(false);
  const [isCancellingRsvp, setIsCancellingRsvp] = useState(false);
  const [cancelRsvpError, setCancelRsvpError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<SessionFormValues | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmingCancelSession, setConfirmingCancelSession] = useState(false);
  const [isCancellingSession, setIsCancellingSession] = useState(false);
  const [cancelSessionError, setCancelSessionError] = useState<string | null>(null);

  const [isProgressing, setIsProgressing] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);

  const [attendanceSelected, setAttendanceSelected] = useState<Set<string>>(new Set());
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceResult, setAttendanceResult] = useState<{ attended: number; noShows: number } | null>(
    null,
  );

  const [isCopied, setIsCopied] = useState(false);

  const loadAll = useCallback(async () => {
    if (!auth) return;
    const { accessToken } = auth;

    try {
      const [sessionData, rsvpsData, myRsvpResult] = await Promise.all([
        apiGet<SessionDetail>(`/api/sessions/${sessionId}`, accessToken),
        apiGet<{ rsvps: SessionRsvp[] }>(`/api/sessions/${sessionId}/rsvps`, accessToken),
        apiGet<MyRsvp>(`/api/sessions/${sessionId}/rsvp`, accessToken).catch(() => null),
      ]);
      setSession(sessionData);
      setRsvps(rsvpsData.rsvps);
      setMyRsvp(myRsvpResult);
      // 'going' rows still exist in /rsvps until markAttendance flips them —
      // default the attendance checklist to "everyone attended" so the
      // organizer only has to uncheck no-shows.
      setAttendanceSelected(new Set(rsvpsData.rsvps.filter((r) => r.status === 'going').map((r) => r.userId)));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        setNotFound(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [auth, sessionId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!auth) return null;

  const isOrganizer = session != null && session.organizerId === auth.userId;
  const going = rsvps.filter((r) => r.status === 'going');
  const waitlisted = rsvps
    .filter((r) => r.status === 'waitlisted')
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());

  async function handleJoin() {
    if (!auth) return;
    setJoinError(null);
    setJoinWarning(null);
    setIsJoining(true);
    try {
      const result = await apiPost<{ status: 'going' | 'waitlisted'; warning?: 'playing_up' | 'playing_down' }>(
        `/api/sessions/${sessionId}/rsvp`,
        auth.accessToken,
      );
      if (result.warning === 'playing_up') {
        setJoinWarning("You're below this session's skill floor, but you're in.");
      } else if (result.warning === 'playing_down') {
        setJoinWarning("You're above this session's skill range, but you're in.");
      }
      await loadAll();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setJoinError("You're outside this session's skill range and can't join.");
      } else if (err instanceof ApiError && err.status === 409) {
        setJoinError('This session is no longer open for new RSVPs.');
      } else {
        setJoinError('Something went wrong. Please try again.');
      }
    } finally {
      setIsJoining(false);
    }
  }

  async function handleCancelRsvp() {
    if (!auth) return;
    setCancelRsvpError(null);
    setIsCancellingRsvp(true);
    try {
      await apiDelete<{ success: true; warning?: 'penalty_not_applied' }>(
        `/api/sessions/${sessionId}/rsvp`,
        auth.accessToken,
      );
      setConfirmingCancelRsvp(false);
      await loadAll();
    } catch {
      setCancelRsvpError('Something went wrong. Please try again.');
    } finally {
      setIsCancellingRsvp(false);
    }
  }

  function startEditing() {
    if (!session) return;
    setEditValues(sessionToFormValues(session));
    setEditError(null);
    setIsEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth || !editValues) return;
    setEditError(null);
    setIsSavingEdit(true);
    try {
      await apiPatch<Session>(`/api/sessions/${sessionId}`, auth.accessToken, {
        venueName: editValues.venueName,
        format: editValues.format,
        visibility: editValues.visibility,
        skillMin: Number(editValues.skillMin),
        skillMax: Number(editValues.skillMax),
        courtCount: Number(editValues.courtCount),
        maxPlayers: Number(editValues.maxPlayers),
        startsAt: new Date(editValues.startsAt).toISOString(),
        durationMinutes: Number(editValues.durationMinutes),
        shuttlePolicy: editValues.shuttlePolicy,
        shuttleTubePrice: editValues.shuttleTubePrice ? Number(editValues.shuttleTubePrice) : null,
        notes: editValues.notes || null,
      });
      setIsEditing(false);
      await loadAll();
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body) {
        setEditError(String((err.body as { error: unknown }).error));
      } else {
        setEditError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleCancelSession() {
    if (!auth) return;
    setCancelSessionError(null);
    setIsCancellingSession(true);
    try {
      await apiDelete<{ success: true }>(`/api/sessions/${sessionId}`, auth.accessToken);
      setConfirmingCancelSession(false);
      await loadAll();
    } catch {
      setCancelSessionError('Something went wrong. Please try again.');
    } finally {
      setIsCancellingSession(false);
    }
  }

  async function handleProgressStatus() {
    if (!auth) return;
    setProgressError(null);
    setIsProgressing(true);
    try {
      await apiPatch<Session>(`/api/sessions/${sessionId}/status`, auth.accessToken, {});
      await loadAll();
    } catch {
      setProgressError('Something went wrong. Please try again.');
    } finally {
      setIsProgressing(false);
    }
  }

  function toggleAttendee(userId: string) {
    setAttendanceSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSaveAttendance() {
    if (!auth) return;
    setAttendanceError(null);
    setIsSavingAttendance(true);
    try {
      const result = await apiPost<{ attended: number; noShows: number }>(
        `/api/sessions/${sessionId}/attendance`,
        auth.accessToken,
        { attendedUserIds: [...attendanceSelected] },
      );
      setAttendanceResult(result);
      await loadAll();
    } catch {
      setAttendanceError('Something went wrong. Please try again.');
    } finally {
      setIsSavingAttendance(false);
    }
  }

  // The Async Clipboard API (navigator.clipboard) only exists in a secure
  // context — https, or http on localhost/127.0.0.1. Testing over a LAN IP
  // (e.g. Safari on a phone hitting http://192.168.1.x:3000) leaves it
  // undefined, so this falls back to the older execCommand('copy') path,
  // which has no such restriction.
  function legacyCopyToClipboard(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);
    return succeeded;
  }

  async function handleShare() {
    const url = window.location.href;
    let succeeded = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        succeeded = true;
      }
    } catch {
      // Fall through to the legacy path below.
    }
    if (!succeeded) succeeded = legacyCopyToClipboard(url);
    if (succeeded) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1000);
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-neutral-500">Loading…</p>
      </AppShell>
    );
  }

  if (notFound || !session) {
    return (
      <AppShell>
        <p className="text-neutral-500">This session doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => router.push('/sessions')}>
          Back to sessions
        </Button>
      </AppShell>
    );
  }

  const isUpcoming = session.status === 'upcoming';
  const isLateWindow = isUpcoming && Date.now() > new Date(session.startsAt).getTime() - HOURS_12_MS;
  const canJoin = isUpcoming && myRsvp == null;
  const canCancelRsvp = myRsvp != null && (myRsvp.status === 'going' || myRsvp.status === 'waitlisted');

  return (
    <AppShell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
        {SESSION_STATUS_LABELS[session.status]}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{session.venueName}</h1>
      <p className="mt-2 text-neutral-600">{formatSessionDateTime(session.startsAt)}</p>
      <p className="mt-1 text-neutral-500">
        Hosted by {session.organizerName ?? 'a Pavilion user'}
      </p>

      <div className="relative mt-3 inline-block">
        {isCopied && (
          <div
            role="status"
            className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 animate-in fade-in-0 zoom-in-95"
          >
            Copied!
          </div>
        )}
        <Button type="button" variant="outline" className="gap-2" onClick={handleShare}>
          <Share2 className="size-4" aria-hidden />
          Share
        </Button>
      </div>

      <div className="mt-8 grid max-w-md grid-cols-2 gap-y-3 text-sm">
        <span className="text-neutral-500">Type</span>
        <span>{SESSION_TYPE_LABELS[session.type]}</span>
        <span className="text-neutral-500">Format</span>
        <span>{SESSION_FORMAT_LABELS[session.format]}</span>
        <span className="text-neutral-500">Visibility</span>
        <span>{SESSION_VISIBILITY_LABELS[session.visibility]}</span>
        <span className="text-neutral-500">Skill range</span>
        <span>{formatSkillRange(session.skillMin, session.skillMax)}</span>
        <span className="text-neutral-500">Courts</span>
        <span>{session.courtCount}</span>
        <span className="text-neutral-500">Duration</span>
        <span>{session.durationMinutes} min</span>
        <span className="text-neutral-500">Shuttles</span>
        <span>
          {SHUTTLE_POLICY_LABELS[session.shuttlePolicy]}
          {session.shuttleTubePrice != null ? ` — $${session.shuttleTubePrice}/tube` : ''}
        </span>
        {session.notes && (
          <>
            <span className="text-neutral-500">Notes</span>
            <span>{session.notes}</span>
          </>
        )}
      </div>

      <section className="mt-10 max-w-md">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
          Going ({going.length}/{session.maxPlayers})
        </h2>
        {going.length > 0 ? (
          <ul className="mt-2 space-y-1 text-neutral-900">
            {going.map((r) => (
              <li key={r.userId}>{r.displayName ?? 'A Pavilion user'}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-neutral-500">No one has joined yet.</p>
        )}

        {waitlisted.length > 0 && (
          <>
            <h2 className="mt-6 text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
              Waitlist
            </h2>
            <ul className="mt-2 space-y-1 text-neutral-900">
              {waitlisted.map((r, i) => (
                <li key={r.userId}>
                  {i + 1}. {r.displayName ?? 'A Pavilion user'}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-10 max-w-md">
        {myRsvp?.status === 'attended' && <p className="text-primary">You attended this session.</p>}
        {myRsvp?.status === 'no_show' && <p className="text-neutral-500">Marked as a no-show.</p>}

        {myRsvp?.status === 'waitlisted' && (
          <p className="text-neutral-700">
            You&apos;re on the waitlist{myRsvp.waitlistPosition ? ` (position ${myRsvp.waitlistPosition})` : ''}.
          </p>
        )}
        {myRsvp?.status === 'going' && <p className="text-primary">You&apos;re going.</p>}
        {joinWarning && <p className="mt-2 text-sm text-primary">{joinWarning}</p>}

        {canCancelRsvp && !confirmingCancelRsvp && (
          <Button type="button" variant="outline" className="mt-4" onClick={() => setConfirmingCancelRsvp(true)}>
            Cancel RSVP
          </Button>
        )}
        {canCancelRsvp && confirmingCancelRsvp && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-neutral-700">
              {isLateWindow
                ? "It's within 12 hours of the session start — cancelling now will cost you reliability points. Cancel anyway?"
                : 'Cancel your RSVP for this session?'}
            </p>
            {cancelRsvpError && <p className="text-sm text-destructive">{cancelRsvpError}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="destructive" disabled={isCancellingRsvp} onClick={handleCancelRsvp}>
                {isCancellingRsvp ? 'Cancelling…' : 'Yes, cancel'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isCancellingRsvp}
                onClick={() => setConfirmingCancelRsvp(false)}
              >
                Never mind
              </Button>
            </div>
          </div>
        )}

        {canJoin && (
          <div className="mt-4">
            <Button type="button" disabled={isJoining} onClick={handleJoin}>
              {isJoining ? 'Joining…' : 'Join session'}
            </Button>
            {joinError && <p className="mt-2 text-sm text-destructive">{joinError}</p>}
          </div>
        )}
        {!canJoin && !canCancelRsvp && !myRsvp && (
          <p className="text-neutral-500">This session isn&apos;t open for new RSVPs.</p>
        )}
      </section>

      {isOrganizer && (
        <section className="mt-12 max-w-md border-t border-border pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
            Manage session
          </h2>

          {isEditing && editValues ? (
            <form onSubmit={handleSaveEdit} className="mt-4">
              <SessionFormFields
                mode="edit"
                values={editValues}
                onChange={(patch) => setEditValues((prev) => (prev ? { ...prev, ...patch } : prev))}
                accessToken={auth.accessToken}
              />
              {editError && <p className="mt-4 text-sm text-destructive">{editError}</p>}
              <div className="mt-6 flex gap-3">
                <Button type="submit" disabled={isSavingEdit}>
                  {isSavingEdit ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="outline" disabled={isSavingEdit} onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {isUpcoming && (
                <Button type="button" variant="outline" onClick={startEditing}>
                  Edit session
                </Button>
              )}
              {(session.status === 'upcoming' || session.status === 'active') && (
                <Button type="button" disabled={isProgressing} onClick={handleProgressStatus}>
                  {isProgressing
                    ? 'Updating…'
                    : session.status === 'upcoming'
                      ? 'Start session'
                      : 'Mark completed'}
                </Button>
              )}
              {isUpcoming && !confirmingCancelSession && (
                <Button type="button" variant="destructive" onClick={() => setConfirmingCancelSession(true)}>
                  Cancel session
                </Button>
              )}
            </div>
          )}

          {progressError && <p className="mt-3 text-sm text-destructive">{progressError}</p>}

          {confirmingCancelSession && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-neutral-700">
                Cancelling notifies no one automatically, but attendees will see this session as cancelled.
                Are you sure?
              </p>
              {cancelSessionError && <p className="text-sm text-destructive">{cancelSessionError}</p>}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isCancellingSession}
                  onClick={handleCancelSession}
                >
                  {isCancellingSession ? 'Cancelling…' : 'Yes, cancel session'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isCancellingSession}
                  onClick={() => setConfirmingCancelSession(false)}
                >
                  Never mind
                </Button>
              </div>
            </div>
          )}

          {session.status === 'completed' && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
                Mark attendance
              </h3>
              {attendanceResult ? (
                <p className="mt-2 text-neutral-700">
                  {attendanceResult.attended} attended, {attendanceResult.noShows} marked as no-show.
                </p>
              ) : going.length > 0 ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-neutral-500">Uncheck anyone who didn&apos;t show up.</p>
                  <div className="space-y-2">
                    {going.map((r) => (
                      <label key={r.userId} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={attendanceSelected.has(r.userId)}
                          onChange={() => toggleAttendee(r.userId)}
                        />
                        {r.displayName ?? 'A Pavilion user'}
                      </label>
                    ))}
                  </div>
                  {attendanceError && <p className="text-sm text-destructive">{attendanceError}</p>}
                  <Button type="button" disabled={isSavingAttendance} onClick={handleSaveAttendance}>
                    {isSavingAttendance ? 'Saving…' : 'Save attendance'}
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-neutral-500">No one had an active RSVP to mark.</p>
              )}
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
