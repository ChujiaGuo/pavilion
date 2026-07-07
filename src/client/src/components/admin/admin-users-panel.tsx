'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RequiredMarker } from '@/components/ui/required-marker';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { apiGet, apiPatch, apiPost, apiErrorMessage, ApiError } from '@/lib/api';
import { roleAtLeast } from '@/lib/admin-role';
import type { AdminRole, PlayFormat, PlayStyle, PrivacyLevel, User } from '@pavilion/types';

// Same debounce shape as session-filters.tsx's SessionFilters: one shared
// timer, no explicit Search button — re-fetches APPLY_DEBOUNCE_MS after the
// last keystroke rather than requiring an explicit submit.
const SEARCH_DEBOUNCE_MS = 400;

const FORMAT_OPTIONS: { id: PlayFormat; label: string }[] = [
  { id: 'singles', label: 'Singles' },
  { id: 'doubles', label: 'Doubles' },
  { id: 'mixed', label: 'Mixed doubles' },
];

const PLAY_STYLE_OPTIONS: { id: PlayStyle; label: string }[] = [
  { id: 'competitive', label: 'Competitive' },
  { id: 'social', label: 'Social' },
  { id: 'training', label: 'Training' },
];

const PRIVACY_OPTIONS: { id: PrivacyLevel; label: string }[] = [
  { id: 'private', label: 'Private' },
  { id: 'public', label: 'Public' },
];

interface EditFields {
  displayName: string;
  firstName: string;
  lastName: string;
  city: string;
  region: string;
  preferredFormats: PlayFormat[];
  playStyle: PlayStyle;
  privacyLevel: PrivacyLevel;
}

function toEditFields(user: User): EditFields {
  return {
    displayName: user.displayName,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    city: user.city,
    region: user.region,
    preferredFormats: user.preferredFormats,
    playStyle: user.playStyle,
    privacyLevel: user.privacyLevel,
  };
}

export function AdminUsersPanel({ accessToken, role }: { accessToken: string; role: AdminRole | null }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const lastSearchedRef = useRef<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fields, setFields] = useState<EditFields | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canAdjustRating = roleAtLeast(role, 'admin');
  const [rawScore, setRawScore] = useState<number | null>(null);
  const [isLoadingRating, setIsLoadingRating] = useState(false);
  const [newScore, setNewScore] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [ratingMessage, setRatingMessage] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const [isVerified, setIsVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (query === lastSearchedRef.current) return;
    const timeout = setTimeout(async () => {
      lastSearchedRef.current = query;
      setSearchError(null);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        const { users } = await apiGet<{ users: User[] }>(`/api/users?${params.toString()}`, accessToken);
        setResults(users);
      } catch {
        setSearchError('Search failed.');
        setResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, accessToken]);

  function startEditing(user: User) {
    setEditingId(user.id);
    setFields(toEditFields(user));
    setSaveError(null);
    setRawScore(null);
    setNewScore('');
    setRatingMessage(null);
    setRatingError(null);
    setIsVerified(user.verifiedTier != null);
    setVerifyError(null);

    if (canAdjustRating) {
      setIsLoadingRating(true);
      apiGet<{ rawScore: number }>(`/api/ratings/user/${user.id}?raw=true`, accessToken)
        .then((res) => setRawScore(res.rawScore))
        .catch(() => setRatingError("Couldn't load this user's rating."))
        .finally(() => setIsLoadingRating(false));
    }
  }

  function toggleFormat(format: PlayFormat) {
    setFields((prev) => {
      if (!prev) return prev;
      const preferredFormats = prev.preferredFormats.includes(format)
        ? prev.preferredFormats.filter((f) => f !== format)
        : [...prev.preferredFormats, format];
      return { ...prev, preferredFormats };
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!fields || !editingId) return;
    setSaveError(null);
    setVerifyError(null);
    setIsSaving(true);

    const rowUser = results.find((u) => u.id === editingId);
    const wasVerified = rowUser ? rowUser.verifiedTier != null : isVerified;
    const verifiedChanged = canAdjustRating && isVerified !== wasVerified;
    // Clearing a verified user's name is only valid together with
    // unverifying them in the same save — the DB rejects a verified row
    // with no name. So when the admin is turning verified off, that call
    // has to land before the profile save; otherwise (turning on, or no
    // change) the profile save goes first, same as before.
    const turningOff = verifiedChanged && wasVerified && !isVerified;

    const profilePayload = {
      ...fields,
      firstName: fields.firstName.trim() || null,
      lastName: fields.lastName.trim() || null,
    };

    try {
      if (turningOff) {
        let unverified: User;
        try {
          unverified = await apiPatch<User>(`/api/users/${editingId}/verify`, accessToken, { verified: false });
        } catch (err) {
          setVerifyError(apiErrorMessage(err, 'Failed to update verification status.'));
          return;
        }
        setIsVerified(unverified.verifiedTier != null);
        setResults((prev) => prev.map((u) => (u.id === unverified.id ? unverified : u)));
      }

      let updated: User;
      try {
        updated = await apiPatch<User>(`/api/users/${editingId}`, accessToken, profilePayload);
      } catch (err) {
        setSaveError(apiErrorMessage(err, 'Failed to save changes.'));
        return;
      }

      if (!turningOff && verifiedChanged) {
        try {
          updated = await apiPatch<User>(`/api/users/${editingId}/verify`, accessToken, {
            verified: isVerified,
          });
        } catch (err) {
          // Profile fields already saved above — keep the panel open so the
          // admin can see the verify-specific error and retry without
          // re-entering the name that just unblocked it.
          setResults((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
          setIsVerified(updated.verifiedTier != null);
          setVerifyError(apiErrorMessage(err, 'Failed to update verification status.'));
          return;
        }
      }

      setIsVerified(updated.verifiedTier != null);
      setResults((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdjustRating(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const score = Number(newScore);
    if (!Number.isFinite(score)) {
      setRatingError('Enter a valid number.');
      return;
    }

    setRatingError(null);
    setRatingMessage(null);
    setIsAdjusting(true);
    try {
      const { rawScore: updatedRawScore } = await apiPost<{ rawScore: number }>(
        `/api/ratings/user/${editingId}/adjust`,
        accessToken,
        { newScore: score },
      );
      setRawScore(updatedRawScore);
      setNewScore('');
      setRatingMessage('Rating updated.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRatingError("This user's rating changed concurrently — reload and try again.");
      } else {
        setRatingError('Failed to adjust rating.');
      }
    } finally {
      setIsAdjusting(false);
    }
  }

  function toggleVerifiedField() {
    setIsVerified((prev) => !prev);
    setVerifyError(null);
  }

  return (
    <div className="space-y-6">
      <Input
        type="text"
        placeholder="Search by display name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {searchError && <p className="text-sm text-destructive">{searchError}</p>}

      <ul className="divide-y divide-border">
        {results.map((user) => (
          <li key={user.id}>
            {editingId === user.id && fields ? (
              <div className="max-w-sm space-y-6 py-4">
                <form onSubmit={handleSave} className="space-y-4">
                  <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <RequiredMarker /> indicates a required field
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor={`displayName-${user.id}`}>
                      Display name
                      <RequiredMarker />
                    </Label>
                    <Input
                      id={`displayName-${user.id}`}
                      required
                      value={fields.displayName}
                      onChange={(e) => setFields({ ...fields, displayName: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`firstName-${user.id}`}>First name</Label>
                      <Input
                        id={`firstName-${user.id}`}
                        value={fields.firstName}
                        onChange={(e) => setFields({ ...fields, firstName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`lastName-${user.id}`}>Last name</Label>
                      <Input
                        id={`lastName-${user.id}`}
                        value={fields.lastName}
                        onChange={(e) => setFields({ ...fields, lastName: e.target.value })}
                      />
                    </div>
                  </div>

                  {user.verifiedTier != null && (
                    <p className="text-xs text-primary">
                      This user is verified — as a moderator you can still edit their name here.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`city-${user.id}`}>City</Label>
                      <Input
                        id={`city-${user.id}`}
                        value={fields.city}
                        onChange={(e) => setFields({ ...fields, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`region-${user.id}`}>State</Label>
                      <Input
                        id={`region-${user.id}`}
                        value={fields.region}
                        onChange={(e) => setFields({ ...fields, region: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Preferred format</Label>
                    <div className="flex flex-col gap-2">
                      {FORMAT_OPTIONS.map((option) => (
                        <label key={option.id} className="flex items-center gap-2 text-sm font-normal">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={fields.preferredFormats.includes(option.id)}
                            onChange={() => toggleFormat(option.id)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Play style</Label>
                    <RadioGroup
                      value={fields.playStyle}
                      onValueChange={(value) => setFields({ ...fields, playStyle: value as PlayStyle })}
                    >
                      {PLAY_STYLE_OPTIONS.map((option) => (
                        <div key={option.id} className="flex items-center gap-3">
                          <RadioGroupItem value={option.id} id={`playStyle-${user.id}-${option.id}`} />
                          <Label htmlFor={`playStyle-${user.id}-${option.id}`} className="font-normal">
                            {option.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label>Privacy</Label>
                    <RadioGroup
                      value={fields.privacyLevel}
                      onValueChange={(value) => setFields({ ...fields, privacyLevel: value as PrivacyLevel })}
                    >
                      {PRIVACY_OPTIONS.map((option) => (
                        <div key={option.id} className="flex items-center gap-3">
                          <RadioGroupItem value={option.id} id={`privacy-${user.id}-${option.id}`} />
                          <Label htmlFor={`privacy-${user.id}-${option.id}`} className="font-normal">
                            {option.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  {canAdjustRating && (
                    <div className="space-y-2 border-t border-border pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label htmlFor={`verified-${user.id}`}>
                            Verified
                            <InfoTooltip>
                              Verifying sets a rating floor of 6.0 (advanced club level) and lifts the 7.99
                              cap that unverified players are held under — pro-tier grades (8-10) can only
                              be reached once verified. Unverifying clears both. Requires a first and last
                              name on file — saved together with the rest of this form.
                            </InfoTooltip>
                          </Label>
                          <p className="text-xs text-neutral-500">
                            {isVerified ? 'Pro tier — floor 6.0, no ceiling' : 'Unverified — capped at 7.99'}
                          </p>
                        </div>
                        <input
                          id={`verified-${user.id}`}
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={isVerified}
                          disabled={isSaving}
                          onChange={toggleVerifiedField}
                        />
                      </div>
                      {verifyError && <p className="text-sm text-destructive">{verifyError}</p>}
                    </div>
                  )}

                  {saveError && <p className="text-sm text-destructive">{saveError}</p>}

                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? 'Saving…' : 'Save changes'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>

                {canAdjustRating && (
                  <div className="space-y-4 border-t border-border pt-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">Rating</p>

                    {isLoadingRating ? (
                      <p className="text-sm text-neutral-500">Loading rating…</p>
                    ) : rawScore !== null ? (
                      <p className="text-sm text-neutral-600">Current raw score: {rawScore.toFixed(2)}</p>
                    ) : null}

                    <form onSubmit={handleAdjustRating} className="space-y-2">
                      <Label htmlFor={`new-score-${user.id}`}>
                        New raw score (1.0–10.0+)
                        <InfoTooltip>
                          Clamped the same way peer votes are: floored at 6.0 if verified (or 1.0
                          otherwise), and capped at 7.99 unless verified — pro grades 8-10 require
                          verification first, regardless of what you enter here.
                        </InfoTooltip>
                      </Label>
                      <Input
                        id={`new-score-${user.id}`}
                        type="number"
                        step="0.01"
                        min="1"
                        value={newScore}
                        onChange={(e) => setNewScore(e.target.value)}
                      />
                      <Button type="submit" disabled={isAdjusting || !newScore}>
                        {isAdjusting ? 'Saving…' : 'Adjust rating'}
                      </Button>
                    </form>

                    {ratingMessage && <p className="text-sm text-primary">{ratingMessage}</p>}
                    {ratingError && <p className="text-sm text-destructive">{ratingError}</p>}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startEditing(user)}
                className="-mx-2 flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <div>
                  <p className="text-sm font-medium">
                    {user.displayName}
                    {user.verifiedTier != null && <span className="ml-2 text-xs text-primary">Verified</span>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {[user.city, user.region].filter(Boolean).join(', ') || 'No location set'} · {user.privacyLevel}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-neutral-400" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
