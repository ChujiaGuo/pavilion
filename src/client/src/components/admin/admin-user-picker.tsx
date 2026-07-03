'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api';
import type { User } from '@pavilion/types';

// Same debounce shape as session-filters.tsx's SessionFilters — no explicit
// Search button, re-fetches SEARCH_DEBOUNCE_MS after the last keystroke.
const SEARCH_DEBOUNCE_MS = 400;

// Shared "find a user, then act on them" search box — used by the Roles
// admin panel, which needs to pick a target user before granting them a
// role. The Users panel has its own dedicated, larger search+edit UI (which
// also folds in rating adjustment for admin+ callers) and doesn't use this.
export function AdminUserPicker({
  accessToken,
  onSelect,
}: {
  accessToken: string;
  onSelect: (user: User) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastSearchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (query === lastSearchedRef.current) return;
    const timeout = setTimeout(async () => {
      lastSearchedRef.current = query;
      setError(null);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        const { users } = await apiGet<{ users: User[] }>(`/api/users?${params.toString()}`, accessToken);
        setResults(users);
      } catch {
        setError('Search failed.');
        setResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, accessToken]);

  return (
    <div className="space-y-3">
      <Input
        type="text"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {results.length > 0 && (
        <ul className="divide-y divide-border">
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => onSelect(user)}
                className="-mx-2 flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <div>
                  <p className="text-sm font-medium">{user.displayName}</p>
                  <p className="text-xs text-neutral-500">
                    {[user.city, user.region].filter(Boolean).join(', ') || 'No location set'}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-neutral-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
