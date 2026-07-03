'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

const content = 'relative mx-auto px-6 sm:px-12 lg:w-2/3 lg:px-0';

// Two different ways to land here, both handled by the same check:
// - /auth/confirm/route.ts (the branded-template path, currently dormant —
//   see technical-notes.md "Auth") already set the session via a cookie
//   server-side before redirecting, so getSession() finds it immediately.
// - GoTrue's own default-template /verify endpoint (the active path today)
//   redirects here with an implicit-flow #access_token=... fragment instead —
//   createClient()'s createBrowserClient defaults detectSessionInUrl to true,
//   so constructing the client parses that fragment and establishes the
//   session itself. Either way, by the time this resolves "Continue to
//   Pavilion" leads to an already-authenticated /home, not another login.
export default function EmailConfirmedPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(() => setReady(true));
  }, []);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#eafcee_0%,#ffffff_30%)] text-neutral-900">
      <header className={`flex items-center py-6 ${content}`}>
        <Link href="/" className="text-lg font-semibold text-primary">
          Pavilion
        </Link>
      </header>

      {ready && (
        <section className="relative pt-8 pb-24 sm:pt-16">
          <div className={content}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              You&apos;re all set
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Email confirmed
            </h1>
            <p className="mt-6 max-w-md text-neutral-600">
              Your account is active. Let&apos;s find you a session.
            </p>

            <Button
              render={<Link href="/home">Continue to Pavilion</Link>}
              className="mt-10 h-10 w-full max-w-md"
            />
          </div>
        </section>
      )}
    </main>
  );
}
