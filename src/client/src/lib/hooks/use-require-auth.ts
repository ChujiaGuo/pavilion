'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export interface RequiredAuth {
  accessToken: string;
  userId: string;
}

// Client-side auth guard for pages behind the authenticated app shell
// (home, venues, sessions, players, ...). Mirrors the session/onboarding
// check onboarding/quiz/page.tsx already does on mount, generalized so
// every gated page doesn't re-implement it. Redirects rather than
// rendering — callers should `return null` while this is null.
export function useRequireAuth(): RequiredAuth | null {
  const router = useRouter();
  const [auth, setAuth] = useState<RequiredAuth | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login');
        return;
      }
      if (!session.user.app_metadata?.onboarding_completed) {
        router.replace('/onboarding/quiz');
        return;
      }
      setAuth({ accessToken: session.access_token, userId: session.user.id });
    });
  }, [router]);

  return auth;
}
