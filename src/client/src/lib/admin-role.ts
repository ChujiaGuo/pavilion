import type { AdminRole } from '@pavilion/types';

// Client-side mirror of src/server/src/lib/admin.ts's role hierarchy — used
// only to decide which admin-page tabs to render. The server independently
// re-checks every action; this never gates anything on its own.
const ROLE_ORDER: AdminRole[] = ['venue_verifier', 'moderator', 'admin', 'owner'];

export function roleAtLeast(role: AdminRole | null, min: AdminRole): boolean {
  return role !== null && ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min);
}
