import Link from 'next/link';
import { Button } from '@/components/ui/button';

const content = 'relative mx-auto px-6 sm:px-12 lg:w-2/3 lg:px-0';

// No client-side state to check here — /auth/confirm/route.ts only redirects
// here after verifyOtp succeeds, and it's already set the session cookie by
// then. "Continue" just goes to /home, whose own useRequireAuth guard
// (see technical-notes.md "Client Application Shell") transparently routes
// on to /onboarding/quiz for a first-time user, same pattern reset-password
// already relies on.
export default function EmailConfirmedPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#eafcee_0%,#ffffff_30%)] text-neutral-900">
      <header className={`flex items-center py-6 ${content}`}>
        <Link href="/" className="text-lg font-semibold text-primary">
          Pavilion
        </Link>
      </header>

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
    </main>
  );
}
