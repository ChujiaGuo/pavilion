import Link from 'next/link';
import { CONTACT_EMAIL, OPERATOR_NAME, PRIVACY_LAST_UPDATED } from '@/lib/legal';

const content = 'relative mx-auto px-6 sm:px-12 lg:w-2/3 lg:px-0';

// DRAFT — see brainstorm.md "Pre-Launch Legal Checklist". OPERATOR_NAME/
// CONTACT_EMAIL/PRIVACY_LAST_UPDATED live in src/lib/legal.ts (shared with
// /terms) — fill in real values there, not inline below. Data-collected
// list should also be re-checked against the domain services
// (user/venue/session/rating) if their schemas change before launch.
export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#eafcee_0%,#ffffff_30%)] text-neutral-900">
      <header className={`flex items-center py-6 ${content}`}>
        <Link href="/" className="text-lg font-semibold text-primary">
          Pavilion
        </Link>
      </header>

      <section className="relative pb-24">
        <div className={`${content} max-w-2xl`}>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Legal</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-neutral-500">Last updated: {PRIVACY_LAST_UPDATED}</p>

          <div className="mt-10 space-y-10 text-neutral-700">
            <section>
              <h2 className="text-xl font-semibold text-neutral-900">1. Overview</h2>
              <p className="mt-3">
                This policy explains what information Pavilion (&ldquo;the app&rdquo;), operated
                by {OPERATOR_NAME}, collects, how it&apos;s used, and the choices you have. By
                using the app you agree to this policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">2. Information We Collect</h2>
              <p className="mt-3">
                <strong>Account information:</strong> email, password (handled by our
                authentication provider — we never see it in plain text), display name, city or
                region, and profile photo if you add one. Legal first/last name is optional at
                signup and required only if you pursue pro-tier rating verification.
              </p>
              <p className="mt-3">
                <strong>Activity data:</strong> sessions you create or RSVP to, venues you
                interact with, peer ratings you give and receive, your reliability (show/no-show)
                history, and verification credentials you submit for pro-tier status (e.g.,
                tournament results, club endorsements).
              </p>
              <p className="mt-3">
                <strong>Messages:</strong> session-scoped group chat messages, handled through our
                messaging provider, Stream Chat.
              </p>
              <p className="mt-3">
                <strong>Usage data:</strong> basic, non-identifying analytics about how the app is
                used, collected through Vercel Analytics.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">3. How We Use It</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li>Operate core features — sessions, venue discovery, ratings, chat</li>
                <li>Compute and maintain your skill rating and reliability score</li>
                <li>Secure your account and prevent abuse (e.g., rating manipulation)</li>
                <li>Improve the app based on aggregate usage patterns</li>
              </ul>
              <p className="mt-3">We don&apos;t sell your personal information.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">4. Who We Share It With</h2>
              <p className="mt-3">
                We share data with the service providers that run the app on our behalf: Supabase
                (database, authentication), Stream Chat (messaging), Google (if you sign in with
                Google), and our hosting providers (Render, Vercel). Other users see the profile
                information and activity you&apos;ve chosen to make visible — see &ldquo;Your
                Choices&rdquo; below. We don&apos;t share your data with advertisers or data
                brokers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">5. Your Choices</h2>
              <p className="mt-3">
                Profile fields, session attendance, and venue activity are private by default —
                other users only see your name in the context of a session you share with them
                (e.g., an attendee list). You can opt in to making your profile and activity
                publicly visible. Your location is always shown at city/region level, never an
                exact address. You can request access to, correction of, or deletion of your
                account data at any time by contacting us below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">6. Data Retention</h2>
              <p className="mt-3">
                We keep your account data while your account is active. If you delete your
                account, we remove your personal information within a reasonable time, except
                where we&apos;re required to retain it (e.g., for legal or security reasons).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">7. Children&apos;s Privacy</h2>
              <p className="mt-3">
                Pavilion isn&apos;t directed at children, and you must be at least 18 to create an
                account. We don&apos;t knowingly collect information from anyone under 18.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">8. Security</h2>
              <p className="mt-3">
                We use industry-standard measures (encryption in transit, access controls on our
                database) to protect your information, but no system is completely secure. Use a
                strong, unique password for your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">9. Changes to This Policy</h2>
              <p className="mt-3">
                We may update this policy as the app evolves. We&apos;ll update the date at the
                top when we do.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">10. Contact</h2>
              <p className="mt-3">
                Questions, or want to access/delete your data? Reach us at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
