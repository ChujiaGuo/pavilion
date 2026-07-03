import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Separate from ../callback/route.ts's PKCE `code` exchange on purpose: the
// confirm-signup email link is opened from a mail client, often on a
// different browser/device than the one that signed up, so there's no
// guarantee the PKCE code verifier stashed at signUp() time is present here.
// verifyOtp with a token_hash needs no client-side state to validate — see
// technical-notes.md "Auth" and supabase/templates/confirm_signup.html,
// which builds this route's URL directly instead of using GoTrue's default
// ConfirmationURL (which points at its own hosted /verify endpoint).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}/email-confirmed`);
    }
  }

  return NextResponse.redirect(`${origin}/verify-email?error=confirmation_link_invalid`);
}
