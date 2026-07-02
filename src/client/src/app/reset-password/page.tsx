'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

const content = 'relative mx-auto px-6 sm:px-12 lg:w-2/3 lg:px-0';

type SessionState = 'checking' | 'valid' | 'invalid';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSessionState(data.session ? 'valid' : 'invalid');
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }

    router.push('/home');
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
            Reset your password
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Choose a new password
          </h1>

          {sessionState === 'checking' && null}

          {sessionState === 'invalid' && (
            <p className="mt-6 max-w-md text-neutral-600">
              This reset link is invalid or has expired.{' '}
              <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                Request a new one
              </Link>
              .
            </p>
          )}

          {sessionState === 'valid' && (
            <form onSubmit={handleSubmit} className="mt-10 max-w-md space-y-6">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={isSubmitting} className="h-10 w-full">
                {isSubmitting ? 'Saving…' : 'Save new password'}
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
