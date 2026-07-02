import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Default post-auth landing for flows that don't set an explicit `next`
// (Google sign-in/sign-up) — the authenticated dashboard, not the public
// marketing page at `/`.
const DEFAULT_NEXT = '/home';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? DEFAULT_NEXT;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // `next` is only ever explicitly set for the password-recovery flow
      // (next=/reset-password) — respect it as-is there. Otherwise this is
      // the Google sign-in/sign-up default, which needs the same
      // onboarding-quiz gate the email/password login page applies.
      if (next === DEFAULT_NEXT && !data.user?.app_metadata?.onboarding_completed) {
        return NextResponse.redirect(`${origin}/onboarding/quiz`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // This route also brokers password-recovery links (resetPasswordForEmail's
  // redirectTo), so an expired/invalid code should fall back to a page that
  // makes sense for that flow rather than always blaming Google sign-in.
  const failureRedirect = next.startsWith('/reset-password')
    ? '/forgot-password?error=reset_link_invalid'
    : '/login?error=oauth_failed';

  return NextResponse.redirect(`${origin}${failureRedirect}`);
}
