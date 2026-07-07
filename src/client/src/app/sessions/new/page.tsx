'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { apiPost, ApiError } from '@/lib/api';
import { AppShell } from '@/components/nav/app-shell';
import { Button } from '@/components/ui/button';
import {
  SessionFormFields,
  emptySessionFormValues,
  type SessionFormValues,
} from '@/components/session/session-form-fields';
import type { Session } from '@pavilion/types';

type CreateResponse = { session: Session; warning?: 'skill_range_wide' };

export default function NewSessionPage() {
  const auth = useRequireAuth();
  const router = useRouter();
  const [values, setValues] = useState<SessionFormValues>(emptySessionFormValues());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingWarning, setPendingWarning] = useState<Session | null>(null);

  function handleChange(patch: Partial<SessionFormValues>) {
    setValues((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setError(null);
    setIsSaving(true);

    try {
      const result = await apiPost<CreateResponse>('/api/sessions', auth.accessToken, {
        venueId: values.venueId || undefined,
        venueName: values.venueName,
        type: values.type,
        format: values.format,
        visibility: values.visibility,
        skillMin: Number(values.skillMin),
        skillMax: Number(values.skillMax),
        courtCount: Number(values.courtCount),
        maxPlayers: Number(values.maxPlayers),
        startsAt: new Date(values.startsAt).toISOString(),
        durationMinutes: Number(values.durationMinutes),
        shuttlePolicy: values.shuttlePolicy,
        shuttleTubePrice: values.shuttleTubePrice ? Number(values.shuttleTubePrice) : null,
        notes: values.notes || null,
      });

      if (result.warning === 'skill_range_wide') {
        setPendingWarning(result.session);
      } else {
        router.push(`/sessions/${result.session.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body) {
        setError(String((err.body as { error: unknown }).error));
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (!auth) return null;

  return (
    <AppShell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Sessions</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Host a session</h1>

      {pendingWarning ? (
        <div className="mt-8 max-w-md space-y-4">
          <p className="text-neutral-700">
            Heads up — this skill range is wide relative to your own rating. You can still host it,
            but consider narrowing the range if you want a more even group.
          </p>
          <Button type="button" onClick={() => router.push(`/sessions/${pendingWarning.id}`)}>
            Continue to session
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 max-w-md">
          <SessionFormFields mode="create" values={values} onChange={handleChange} accessToken={auth.accessToken} />

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          <div className="mt-6 flex items-center gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Creating…' : 'Create session'}
            </Button>
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
