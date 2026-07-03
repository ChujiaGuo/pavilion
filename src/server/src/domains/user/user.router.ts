import { Hono } from 'hono';
import { auth } from '../../middleware/auth.js';
import { getAdminRole, roleAtLeast } from '../../lib/admin.js';
import { getUserById, updateUser, softDeleteUser, searchUsers, setVerifiedStatus } from './user.service.js';
import type { PlayFormat, PlayStyle, PrivacyLevel } from '@pavilion/types';

export const userRouter = new Hono<{ Variables: { userId: string } }>();

userRouter.use(auth);

const VALID_PLAY_FORMATS: PlayFormat[] = ['singles', 'doubles', 'mixed'];
const VALID_PLAY_STYLES: PlayStyle[] = ['competitive', 'social', 'training'];
const VALID_PRIVACY_LEVELS: PrivacyLevel[] = ['private', 'public'];

// Moderator+ only — search all users, including private profiles. Placed
// before /:id isn't necessary here (Hono matches literal segments before
// params), but kept near the top since it's the "list" counterpart to /:id.
userRouter.get('/', async (c) => {
  const { q, id } = c.req.query();
  const result = await searchUsers(c.get('userId'), { q, id });
  if (!result.ok) return c.json({ error: 'Forbidden' }, 403);
  return c.json({ users: result.users });
});

userRouter.get('/:id', async (c) => {
  const user = await getUserById(c.req.param('id'), c.get('userId'));
  if (!user) return c.json({ error: 'Not found' }, 404);
  return c.json(user);
});

userRouter.patch('/:id', async (c) => {
  const targetId = c.req.param('id');
  const callerId = c.get('userId');
  let bypassNameLock = false;

  if (targetId !== callerId) {
    const callerRole = await getAdminRole(callerId);
    if (!roleAtLeast(callerRole, 'moderator')) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    bypassNameLock = true;
  }

  const body = await c.req.json();
  const {
    displayName, firstName, lastName, photoUrl, city, region,
    preferredFormats, playStyle, privacyLevel,
  } = body as Record<string, unknown>;

  // Every field updateUser() reads is validated here — it's the only thing
  // standing between an arbitrary request body and a raw DB write, since
  // updateUser() itself has no validation (it trusts fields it's handed,
  // see user.service.ts). Fields it doesn't read (e.g. internalScore,
  // verifiedTier) don't need validation — they're already unreachable
  // regardless of what's in the body.
  if (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim() === '')) {
    return c.json({ error: 'displayName must be a non-empty string' }, 400);
  }
  if (firstName !== undefined && firstName !== null && typeof firstName !== 'string') {
    return c.json({ error: 'firstName must be a string or null' }, 400);
  }
  if (lastName !== undefined && lastName !== null && typeof lastName !== 'string') {
    return c.json({ error: 'lastName must be a string or null' }, 400);
  }
  if (photoUrl !== undefined && photoUrl !== null && typeof photoUrl !== 'string') {
    return c.json({ error: 'photoUrl must be a string or null' }, 400);
  }
  if (city !== undefined && typeof city !== 'string') {
    return c.json({ error: 'city must be a string' }, 400);
  }
  if (region !== undefined && typeof region !== 'string') {
    return c.json({ error: 'region must be a string' }, 400);
  }
  if (preferredFormats !== undefined) {
    const isValid =
      Array.isArray(preferredFormats) &&
      preferredFormats.every((f) => VALID_PLAY_FORMATS.includes(f as PlayFormat));
    if (!isValid) return c.json({ error: 'Invalid preferredFormats' }, 400);
  }
  if (playStyle !== undefined && !VALID_PLAY_STYLES.includes(playStyle as PlayStyle)) {
    return c.json({ error: 'Invalid playStyle' }, 400);
  }
  if (privacyLevel !== undefined && !VALID_PRIVACY_LEVELS.includes(privacyLevel as PrivacyLevel)) {
    return c.json({ error: 'Invalid privacyLevel' }, 400);
  }

  const result = await updateUser(targetId, body, { bypassNameLock, performedBy: bypassNameLock ? callerId : undefined });
  if (!result.ok) {
    if (result.reason === 'name_locked') {
      return c.json({ error: 'Name is locked after verification and cannot be changed' }, 403);
    }
    if (result.reason === 'verified_requires_name') {
      return c.json(
        { error: 'A verified user must have a first and last name on file — unverify them first if you want to clear it.' },
        400,
      );
    }
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(result.user);
});

// Admin+ only. Sets/clears verified_tier + rating_floor per the "Verification
// approval action" spec (technical-notes.md) — a direct, immediate version of
// the still-unbuilt verification_requests approve flow, no evidence review.
userRouter.patch('/:id/verify', async (c) => {
  const body = await c.req.json();
  const { verified } = body as { verified?: unknown };
  if (typeof verified !== 'boolean') {
    return c.json({ error: 'verified must be a boolean' }, 400);
  }

  const result = await setVerifiedStatus(c.get('userId'), c.req.param('id'), verified);
  if (!result.ok) {
    if (result.reason === 'forbidden') return c.json({ error: 'Forbidden' }, 403);
    if (result.reason === 'name_required') {
      return c.json({ error: 'This user needs a first and last name on file before they can be verified' }, 400);
    }
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(result.user);
});

userRouter.delete('/:id', async (c) => {
  if (c.req.param('id') !== c.get('userId')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const ok = await softDeleteUser(c.get('userId'));
  if (!ok) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});
