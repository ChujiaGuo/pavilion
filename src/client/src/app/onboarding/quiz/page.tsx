'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { createClient } from '@/lib/supabase/client';
import { apiPost, ApiError } from '@/lib/api';
import { quizSteps, type QuizStepId } from './quiz-config';

const content = 'relative mx-auto px-6 sm:px-12 lg:w-2/3 lg:px-0';

type Answers = Partial<Record<QuizStepId, string>>;

export default function OnboardingQuizPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/');
        return;
      }
      if (session.user.app_metadata?.onboarding_completed) {
        router.replace('/home');
        return;
      }
      setAccessToken(session.access_token);
    });
  }, [router]);

  async function finishWith(request: () => Promise<unknown>) {
    setError(null);
    setIsSubmitting(true);
    try {
      await request();
    } catch (err) {
      // Already-completed just means the goal state already holds — the
      // cached-session guard above can be stale for a short window, but
      // there's nothing wrong to report to the user here.
      if (!(err instanceof ApiError && err.status === 409)) {
        setError('Something went wrong. Please try again.');
        setIsSubmitting(false);
        return;
      }
    }

    // The server best-effort-syncs app_metadata.onboarding_completed via the
    // admin API, but that never reaches this already-issued client session —
    // getSession() would keep returning the stale pre-onboarding JWT, and
    // /home's auth guard would bounce straight back here. Force a refresh so
    // the guard sees the real value before we hand off.
    try {
      await createClient().auth.refreshSession();
    } catch {
      // Best-effort — worst case /home's guard bounces back here once, same
      // as before this fix, rather than blocking the redirect over it.
    }
    router.replace('/home');
  }

  function handleSkip() {
    if (!accessToken) return;
    finishWith(() => apiPost('/api/ratings/onboarding/skip', accessToken));
  }

  function handleFinish() {
    if (!accessToken) return;
    finishWith(() => apiPost('/api/ratings/onboarding/submit', accessToken, { answers }));
  }

  if (!accessToken) return null;

  const step = quizSteps[stepIndex];
  const isLastStep = stepIndex === quizSteps.length - 1;
  const selected = answers[step.id];

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
            Step {stepIndex + 1} of {quizSteps.length}
          </p>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{step.prompt}</h1>

          <div className="mt-8 max-w-md">
            <RadioGroup
              // Always a defined string (never undefined) so the component is
              // controlled from the very first render — flipping from
              // undefined to a real value after the first selection is what
              // triggers Base UI's uncontrolled-to-controlled warning.
              value={selected ?? ''}
              onValueChange={(value) => setAnswers((prev) => ({ ...prev, [step.id]: String(value) }))}
              className="gap-4"
            >
              {step.options.map((option) => (
                <div key={option.id} className="flex items-center gap-3">
                  <RadioGroupItem value={option.id} id={option.id} />
                  <Label htmlFor={option.id} className="font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {error && <p className="mt-6 text-sm text-destructive">{error}</p>}

          <div className="mt-10 flex max-w-md items-center gap-3">
            {stepIndex > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setStepIndex((i) => i - 1)}
              >
                Back
              </Button>
            )}

            {isLastStep ? (
              <Button type="button" disabled={!selected || isSubmitting} onClick={handleFinish}>
                {isSubmitting ? 'Finishing…' : 'Finish'}
              </Button>
            ) : (
              <Button type="button" disabled={!selected} onClick={() => setStepIndex((i) => i + 1)}>
                Next
              </Button>
            )}
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSkip}
            className="mt-6 text-sm font-medium text-neutral-500 hover:text-neutral-700 hover:underline"
          >
            Skip for now
          </button>
        </div>
      </section>
    </main>
  );
}
