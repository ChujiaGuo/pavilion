'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { apiGet, apiPatch } from '@/lib/api';
import { AppShell } from '@/components/nav/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RequiredMarker } from '@/components/ui/required-marker';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { BadgeCheck, LogOut, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { US_STATES, type UsState } from '@/lib/us-states';
import type { PlayFormat, PlayStyle, PrivacyLevel, RatingDisplay, User } from '@pavilion/types';

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMemberSince(createdAt: string) {
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

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

// The editable subset of User — excludes photoUrl (no upload flow exists
// yet). firstName/lastName are optional here even though they become
// required once verified_tier is set (profiles_verified_requires_name CHECK
// constraint — see technical-notes.md "Verification approval action"):
// clearing them for an already-verified user fails at the DB constraint,
// which surfaces as the generic save error below rather than a
// field-specific message — that gap is pre-existing, not new to this form.
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

export default function ProfilePage() {
  const auth = useRequireAuth();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rating, setRating] = useState<RatingDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [fields, setFields] = useState<EditFields | null>(null);

  useEffect(() => {
    if (!auth) return;
    const { accessToken, userId } = auth;

    async function load() {
      try {
        const [userData, ratingData] = await Promise.all([
          apiGet<User>(`/api/users/${userId}`, accessToken),
          apiGet<{ rating: RatingDisplay }>(`/api/ratings/user/${userId}`, accessToken),
        ]);
        setUser(userData);
        setRating(ratingData.rating);
      } catch {
        // Widget degrades to an empty state rather than blocking the page.
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [auth]);

  async function handleLogout() {
    setIsLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/');
  }

  function startEditing() {
    if (!user) return;
    setFields(toEditFields(user));
    setEditError(null);
    setIsEditing(true);
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
    if (!fields || !auth) return;
    setEditError(null);
    setIsSaving(true);

    // Verified users' names are locked server-side (user.router.ts 403s any
    // PATCH that even mentions firstName/lastName once verified) — omit the
    // keys entirely here rather than sending unchanged values, so a locked
    // user can still save unrelated fields like city/state.
    const { firstName, lastName, ...rest } = fields;
    const payload = isNameLocked
      ? rest
      : { ...rest, firstName: firstName.trim() || null, lastName: lastName.trim() || null };

    try {
      const updated = await apiPatch<User>(`/api/users/${auth.userId}`, auth.accessToken, payload);
      setUser(updated);
      setIsEditing(false);
    } catch {
      setEditError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!auth) return null;

  const isNameLocked = user?.verifiedTier != null;

  return (
    <AppShell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Profile</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Your profile</h1>

      {isLoading ? (
        <p className="mt-6 text-neutral-500">Loading…</p>
      ) : !user ? (
        <p className="mt-6 text-neutral-500">Couldn&apos;t load your profile.</p>
      ) : isEditing && fields ? (
        <form onSubmit={handleSave} className="mt-8 max-w-md space-y-6">
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <RequiredMarker /> indicates a required field
          </p>

          <div className="space-y-2">
            <Label htmlFor="displayName">
              Display name
              <RequiredMarker />
            </Label>
            <Input
              id="displayName"
              type="text"
              required
              value={fields.displayName}
              onChange={(e) => setFields({ ...fields, displayName: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First name
                {isNameLocked && (
                  <InfoTooltip>
                    Your name is locked because your account is verified — verified names can&apos;t
                    be changed.
                  </InfoTooltip>
                )}
              </Label>
              <Input
                id="firstName"
                type="text"
                autoComplete="given-name"
                disabled={isNameLocked}
                value={fields.firstName}
                onChange={(e) => setFields({ ...fields, firstName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                type="text"
                autoComplete="family-name"
                disabled={isNameLocked}
                value={fields.lastName}
                onChange={(e) => setFields({ ...fields, lastName: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                type="text"
                value={fields.city}
                onChange={(e) => setFields({ ...fields, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">State</Label>
              <Combobox
                items={US_STATES}
                value={US_STATES.find((s) => s.value === fields.region) ?? null}
                onValueChange={(item: UsState | null) =>
                  setFields({ ...fields, region: item?.value ?? '' })
                }
              >
                <ComboboxInput id="region" placeholder="Search states…" showClear className="w-full" />
                <ComboboxContent>
                  <ComboboxEmpty>No states found.</ComboboxEmpty>
                  <ComboboxList>
                    {(item: UsState) => (
                      <ComboboxItem key={item.value} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
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
              className="gap-3"
            >
              {PLAY_STYLE_OPTIONS.map((option) => (
                <div key={option.id} className="flex items-center gap-3">
                  <RadioGroupItem value={option.id} id={`play-style-${option.id}`} />
                  <Label htmlFor={`play-style-${option.id}`} className="font-normal">
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
              className="gap-3"
            >
              {PRIVACY_OPTIONS.map((option) => (
                <div key={option.id} className="flex items-center gap-3">
                  <RadioGroupItem value={option.id} id={`privacy-${option.id}`} />
                  <Label htmlFor={`privacy-${option.id}`} className="font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {editError && <p className="text-sm text-destructive">{editError}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-8 max-w-md space-y-6">
          <div>
            <p className="flex items-center gap-1.5 text-lg font-semibold">
              {user.displayName}
              {user.verifiedTier != null && (
                <BadgeCheck className="size-4 text-primary" aria-label="Verified" />
              )}
            </p>
            {(user.firstName || user.lastName) && (
              <p className="text-neutral-600">
                {[user.firstName, user.lastName].filter(Boolean).join(' ')}
              </p>
            )}
          </div>

          {rating && (
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
                Rating
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 leading-none text-neutral-900">
                <span className="translate-y-px whitespace-nowrap">Grade {rating.grade}</span>
                <span className="text-neutral-300" aria-hidden>
                  |
                </span>
                <span
                  className="flex shrink-0 items-center gap-0.5"
                  aria-label={`${rating.subtier} out of 4 stars`}
                >
                  {[1, 2, 3, 4].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        'size-4',
                        star <= rating.subtier
                          ? 'fill-primary text-primary'
                          : 'fill-none text-neutral-300'
                      )}
                      aria-hidden
                    />
                  ))}
                </span>
                {rating.isProvisional && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Provisional
                    <InfoTooltip>
                      Your rating is based on your onboarding quiz answers and adjusts more per
                      session until you&apos;ve completed a few rated sessions with other players.
                    </InfoTooltip>
                  </span>
                )}
                {rating.atUnverifiedCeiling && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Verification required to advance
                    <InfoTooltip>
                      Peer ratings alone cap out at Grade 7. To be promoted further, submit
                      verification — tournament results, a national ranking, or a club/coach
                      endorsement.
                    </InfoTooltip>
                  </span>
                )}
              </p>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
              Location
            </p>
            <p className="mt-1 text-neutral-900">
              {[user.city, user.region].filter(Boolean).join(', ') || 'Not set'}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
              Preferred format
            </p>
            <p className="mt-1 text-neutral-900">
              {user.preferredFormats.length > 0
                ? user.preferredFormats.map(capitalize).join(', ')
                : 'Not set'}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
              Play style
            </p>
            <p className="mt-1 text-neutral-900">
              {user.playStyle ? capitalize(user.playStyle) : 'Not set'}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
              Privacy
            </p>
            <p className="mt-1 text-neutral-900">{capitalize(user.privacyLevel)}</p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
              Member since
            </p>
            <p className="mt-1 text-neutral-900">{formatMemberSince(user.createdAt)}</p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={startEditing}>
              Edit profile
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isLoggingOut}
              onClick={handleLogout}
            >
              <LogOut className="size-4" aria-hidden />
              {isLoggingOut ? 'Logging out…' : 'Log out'}
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
