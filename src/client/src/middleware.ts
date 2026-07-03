import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Built per-request (not in next.config.ts) because the nonce below has to
// be unique per request — a static header can't carry one. Next.js reads
// the nonce back out of this same header (via the request headers we set
// below) and stamps it onto every inline script it renders for hydration/RSC
// streaming, which is the only reason those need CSP coverage at all — see
// the conversation this came out of for the CSP report-only violations that
// motivated it.
function buildCsp(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL!;

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl} ${apiUrl}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// Server Components can read cookies but can't set them, so a session
// refreshed mid-render never persists — see the comment in
// lib/supabase/server.ts. This runs on every request to refresh an expiring
// session and write the rotated cookie back before any Server Component
// or Route Handler reads it.
export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  // Next only picks the nonce up if it's on the *request* headers it sees
  // internally (see get-script-nonce-from-header.js) — the response header
  // alone only tells the browser what to enforce/report, it doesn't feed
  // back into how Next renders the page.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy-Report-Only', csp);

  function nextWithCsp() {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy-Report-Only', csp);
    return res;
  }

  let response = nextWithCsp();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = nextWithCsp();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
