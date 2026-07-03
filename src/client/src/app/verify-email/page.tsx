'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

const content = 'relative mx-auto px-6 sm:px-12 lg:w-2/3 lg:px-0';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const linkInvalid = searchParams.get('error') === 'confirmation_link_invalid';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    if (!email) return;
    setIsSubmitting(true);
    setError(null);
    setResent(false);

    const supabase = createClient();
    // Same emailRedirectTo as signup/page.tsx's initial signUp() call — see
    // its comment for why (GoTrue's default template is active, not
    // confirm_signup.html, so this controls where the browser lands post-confirm).
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/email-confirmed` },
    });

    setIsSubmitting(false);
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setResent(true);
  }

  return (
    <section className="relative pt-8 pb-24 sm:pt-16">
      <div className={content}>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          One more step
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Verify your email
        </h1>

        {linkInvalid && (
          <p className="mt-6 max-w-md text-destructive">
            That confirmation link is invalid or has expired. Request a new one below.
          </p>
        )}

        <p className="mt-6 max-w-md text-neutral-600">
          {email ? (
            <>
              We&apos;ve sent a confirmation link to <span className="font-medium text-neutral-900">{email}</span>.
              Click the link to activate your account and start finding sessions.
            </>
          ) : linkInvalid ? (
            <>
              Log in with your email and password below — you&apos;ll land right back here with a
              button to send a fresh link.
            </>
          ) : (
            <>Check your inbox for a confirmation link to activate your account.</>
          )}
        </p>

        {email && (
          <div className="mt-8 max-w-md">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={handleResend}
              className="h-10 w-full"
            >
              {isSubmitting ? 'Sending…' : 'Resend confirmation email'}
            </Button>

            {resent && <p className="mt-3 text-sm text-primary">Confirmation email resent.</p>}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </div>
        )}

        <p className="mt-8 text-sm text-neutral-600">
          {email ? 'Already verified?' : 'Have an account?'}{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#eafcee_0%,#ffffff_30%)] text-neutral-900">
      <header className={`flex items-center py-6 ${content}`}>
        <Link href="/" className="text-lg font-semibold text-primary">
          Pavilion
        </Link>
      </header>

      <Suspense fallback={null}>
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
