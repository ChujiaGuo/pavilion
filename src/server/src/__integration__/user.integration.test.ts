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

    const updated = await updateUser(user.id, { firstName: null, lastName: null });

    expect(updated).not.toBeNull();
    expect(updated!.firstName).toBeNull();
    expect(updated!.lastName).toBeNull();
  });

  it('rejects clearing a verified user\'s name via updateUser', async () => {
    const user = await createTestUser({ firstName: 'Jane', lastName: 'Doe', verifiedTier: 8 });

    const result = await updateUser(user.id, { firstName: null });

    expect(result).toBeNull();

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single();
    expect(profile!.first_name).toBe('Jane');
  });

  it('rejects writing verified_tier directly on a profile with no name set', async () => {
    const user = await createTestUser();

    const { error } = await supabase.from('profiles').update({ verified_tier: 8 }).eq('id', user.id);

    expect(error).not.toBeNull();
    expect(error!.message).toContain('profiles_verified_requires_name');
  });
});
