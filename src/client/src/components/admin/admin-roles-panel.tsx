'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AdminUserPicker } from './admin-user-picker';
import { apiGet, apiPatch, apiDelete } from '@/lib/api';
import type { AdminGrant, AdminRole } from '@pavilion/types';

const ROLE_OPTIONS: { id: AdminRole; label: string }[] = [
  { id: 'venue_verifier', label: 'Venue verifier' },
  { id: 'moderator', label: 'Moderator' },
  { id: 'admin', label: 'Admin' },
  { id: 'owner', label: 'Owner' },
];

// Broader than the full `User` type: only the two fields this panel's form
// actually reads. Lets a "Current admins" row (an `AdminGrant`, which has no
// other `User` fields) and `AdminUserPicker`'s full `User` selection share
// the same `target` state.
type EditTarget = { id: string; displayName: string };

export function AdminRolesPanel({ accessToken }: { accessToken: string }) {
  const [admins, setAdmins] = useState<AdminGrant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [selectedRole, setSelectedRole] = useState<AdminRole>('moderator');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditingExisting = target !== null && admins.some((a) => a.userId === target.id);

  function startEditingAdmin(grant: AdminGrant) {
    setTarget({ id: grant.userId, displayName: grant.displayName });
    setSelectedRole(grant.role);
    setError(null);
  }

  function loadAdmins() {
    setIsLoading(true);
    apiGet<{ admins: AdminGrant[] }>('/api/admin/roles', accessToken)
      .then((res) => setAdmins(res.admins))
      .catch(() => setAdmins([]))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadAdmins();
  }, [accessToken]);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    setIsSaving(true);
    try {
      await apiPatch(`/api/admin/roles/${target.id}`, accessToken, { role: selectedRole });
      setTarget(null);
      loadAdmins();
    } catch {
      setError('Failed to grant role.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(userId: string) {
    try {
      await apiDelete(`/api/admin/roles/${userId}`, accessToken);
      loadAdmins();
    } catch {
      setError('Failed to remove role.');
    }
  }

  return (
    <div className="space-y-8">
      <div className="max-w-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">Current admins</p>
        {isLoading ? (
          <p className="mt-2 text-sm text-neutral-500">Loading…</p>
        ) : admins.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No roles granted yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {admins.map((grant) => (
              <li key={grant.userId}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => startEditingAdmin(grant)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      startEditingAdmin(grant);
                    }
                  }}
                  className="-mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                >
                  <div>
                    <p className="text-sm font-medium">{grant.displayName}</p>
                    <p className="text-xs text-neutral-500">{grant.role}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(grant.userId);
                      }}
                    >
                      Remove
                    </Button>
                    <ChevronRight className="size-4 shrink-0 text-neutral-400" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="max-w-sm space-y-4 border-t border-border pt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
          {isEditingExisting ? 'Edit role' : 'Grant a role'}
        </p>

        {!target ? (
          <AdminUserPicker accessToken={accessToken} onSelect={setTarget} />
        ) : (
          <form onSubmit={handleGrant} className="space-y-4">
            <p className="text-sm">
              {isEditingExisting ? 'Editing the role for' : 'Granting a role to'}{' '}
              <span className="font-medium">{target.displayName}</span>
            </p>

            <div className="space-y-2">
              <Label>Role</Label>
              <RadioGroup value={selectedRole} onValueChange={(v) => setSelectedRole(v as AdminRole)}>
                {ROLE_OPTIONS.map((option) => (
                  <div key={option.id} className="flex items-center gap-3">
                    <RadioGroupItem value={option.id} id={`role-${option.id}`} />
                    <Label htmlFor={`role-${option.id}`} className="font-normal">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : isEditingExisting ? 'Save role' : 'Grant role'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setTarget(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
