'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RequiredMarker } from '@/components/ui/required-marker';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { createClient } from '@/lib/supabase/client';

const content = 'relative mx-auto px-6 sm:px-12 lg:w-2/3 lg:px-0';

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    // city/firstName/lastName ride along in signUp's metadata rather than a
    // follow-up PATCH — handle_new_user (supabase/migrations) reads them off
    // raw_user_meta_data when it creates the profile row, which fires
    // unconditionally on signup regardless of whether email confirmation is
    // required. A follow-up PATCH would need the fresh session's access
    // token, which doesn't exist yet when confirmation is pending (data.session
    // is null below) — see technical-notes.md "Auth".
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          city,
          ...(firstName && { first_name: firstName }),
          ...(lastName && { last_name: lastName }),
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsSubmitting(false);
      return;
    }

    if (!data.session) {
      // Email confirmation required (prod today, and local dev now mirrors
      // it — see supabase/config.toml's enable_confirmations) — no session
      // was issued, so there's nothing to onboard yet.
      router.replace(`/verify-email?email=${encodeURIComponent(email)}`);
      return;
    }

    router.replace('/onboarding/quiz');
  }

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
            Get started
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Create your account
          </h1>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
            <RequiredMarker /> indicates a required field
          </p>

          <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">
                Display name
                <RequiredMarker />
              </Label>
              <Input
                id="displayName"
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Email
                <RequiredMarker />
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">
                City
                <RequiredMarker />
              </Label>
              <Input
                id="city"
                type="text"
                autoComplete="address-level2"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Password
                <RequiredMarker />
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={isSubmitting} className="h-10 w-full">
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <div className="mt-6 flex max-w-md items-center gap-4 text-xs uppercase tracking-[0.15em] text-neutral-400">
            <span className="h-px flex-1 bg-neutral-200" />
            or
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <div className="mt-6 max-w-md">
            <GoogleSignInButton text="Sign up with Google" />
          </div>

          <p className="mt-8 text-sm text-neutral-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}