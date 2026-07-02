import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { supabase } from '../lib/supabase.js';
import { updateUser } from '../domains/user/user.service.js';
import { createTestUser, truncateAll, closePgClient } from '../test/integration-helpers.js';

describe('profiles.profiles_verified_requires_name CHECK constraint (integration)', () => {
  afterEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closePgClient();
  });

  it('allows an unverified user to leave first/last name unset', async () => {
    const user = await createTestUser();

    const result = await updateUser(user.id, { firstName: null, lastName: null });

    expect(result.ok).toBe(true);
    expect(result.ok && result.user.firstName).toBeNull();
    expect(result.ok && result.user.lastName).toBeNull();
  });

  it('rejects clearing a verified user\'s name at the app layer, before the CHECK constraint is ever reached', async () => {
    const user = await createTestUser({ firstName: 'Jane', lastName: 'Doe', verifiedTier: 8 });

    const result = await updateUser(user.id, { firstName: null });

    expect(result).toEqual({ ok: false, reason: 'name_locked' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single();
    expect(profile!.first_name).toBe('Jane');
  });

  it('rejects changing (not just clearing) a verified user\'s name', async () => {
    const user = await createTestUser({ firstName: 'Jane', lastName: 'Doe', verifiedTier: 8 });

    const result = await updateUser(user.id, { firstName: 'NotJane' });

    expect(result).toEqual({ ok: false, reason: 'name_locked' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('id', user.id)
      .single();
    expect(profile!.first_name).toBe('Jane');
  });

  it('still allows non-name field changes on a verified user', async () => {
    const user = await createTestUser({ firstName: 'Jane', lastName: 'Doe', verifiedTier: 8 });

    const result = await updateUser(user.id, { city: 'Seattle' });

    expect(result.ok).toBe(true);
    expect(result.ok && result.user.city).toBe('Seattle');
  });

  it('rejects writing verified_tier directly on a profile with no name set', async () => {
    const user = await createTestUser();

    const { error } = await supabase.from('profiles').update({ verified_tier: 8 }).eq('id', user.id);

    expect(error).not.toBeNull();
    expect(error!.message).toContain('profiles_verified_requires_name');
  });
});
