'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import type { AdminHistoryEntry, AdminHistoryFieldChange, AdminRole } from '@pavilion/types';

const ACTION_LABEL: Record<string, string> = {
  grant: 'granted role to',
  revoke: 'revoked role from',
  change_role: 'changed role of',
  edit: 'edited',
  cancel: 'cancelled',
  advance_status: 'advanced status of',
  mark_attendance: 'marked attendance for',
  remove_rsvp: 'removed a player from',
  create: 'created',
  adjust_rating: 'adjusted rating of',
};

const ROLE_LABEL: Record<AdminRole, string> = {
  venue_verifier: 'Venue verifier',
  moderator: 'Moderator',
  admin: 'Admin',
  owner: 'Owner',
};

function formatAction(entry: AdminHistoryEntry): string {
  return ACTION_LABEL[entry.action] ?? entry.action;
}

// camelCase field name -> "Human readable" label, e.g. "skillMin" -> "Skill min".
function humanizeField(field: string): string {
  const spaced = field.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return 'none';
  if (field === 'role') return ROLE_LABEL[value as AdminRole] ?? String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (field === 'score' && typeof value === 'number') return value.toFixed(2);
  return String(value);
}

function formatChange(change: AdminHistoryFieldChange): string {
  return `${humanizeField(change.field)}: ${formatValue(change.field, change.before)} → ${formatValue(change.field, change.after)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AdminHistoryPanel({ accessToken }: { accessToken: string }) {
  const [entries, setEntries] = useState<AdminHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    apiGet<{ entries: AdminHistoryEntry[] }>('/api/admin/history', accessToken)
      .then((res) => setEntries(res.entries))
      .catch(() => setError('Failed to load history.'))
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (entries.length === 0) return <p className="text-sm text-neutral-500">No admin activity yet.</p>;

  return (
    <ul className="max-w-2xl divide-y divide-border">
      {entries.map((entry) => (
        <li key={`${entry.domain}-${entry.id}`} className="py-3">
          <p className="text-sm">
            <span className="font-medium">{entry.performedByDisplayName}</span>{' '}
            {formatAction(entry)} <span className="font-medium">{entry.targetLabel}</span>
          </p>
          {entry.changes && entry.changes.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {entry.changes.map((change) => (
                <li key={change.field} className="text-xs text-neutral-500">
                  {formatChange(change)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-neutral-500">{formatDate(entry.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}
