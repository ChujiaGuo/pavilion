import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
