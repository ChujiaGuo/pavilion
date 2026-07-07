import Link from 'next/link';
import { CONTACT_EMAIL, GOVERNING_LAW, OPERATOR_NAME, TERMS_LAST_UPDATED } from '@/lib/legal';

const content = 'relative mx-auto px-6 sm:px-12 lg:w-2/3 lg:px-0';

// DRAFT — see brainstorm.md "Pre-Launch Legal Checklist". OPERATOR_NAME/
// CONTACT_EMAIL/GOVERNING_LAW/TERMS_LAST_UPDATED live in src/lib/legal.ts
// (shared with /privacy) — fill in real values there, not inline below. The
// Assumption of Risk section should also get a quick lawyer pass given the
// in-person physical-activity liability surface — everything else here is
// fine as template language.
export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-neutral-500">Last updated: {TERMS_LAST_UPDATED}</p>

          <div className="mt-10 space-y-10 text-neutral-700">
            <section>
              <h2 className="text-xl font-semibold text-neutral-900">1. Acceptance of Terms</h2>
              <p className="mt-3">
                By creating an account or using Pavilion (&ldquo;the app,&rdquo; &ldquo;the
                service&rdquo;), you agree to these Terms of Service. If you don&apos;t agree,
                don&apos;t use the app. Pavilion is operated by {OPERATOR_NAME}.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">2. Eligibility</h2>
              <p className="mt-3">
                You must be at least 18 years old to create an account. By registering, you
                confirm you meet this requirement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">
                3. What Pavilion Is (and Isn&apos;t)
              </h2>
              <p className="mt-3">
                Pavilion is a coordination layer for badminton players — it helps you find
                venues, plan and RSVP to sessions, and get rated by other players. Pavilion does
                not book courts on your behalf, process payments for sessions or venue rentals, or
                verify the accuracy of venue listings, session details, or other users&apos;
                skill claims. Any money exchanged between players, organizers, or venues (e.g.,
                court rental costs, shuttle contributions) happens directly between those parties,
                outside the app. Pavilion is not a party to that arrangement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">
                4. Your Account
              </h2>
              <p className="mt-3">
                You&apos;re responsible for keeping your login credentials secure and for
                activity that happens under your account. Tell us if you believe your account has
                been compromised.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">
                5. Assumption of Risk — Sessions and In-Person Play
              </h2>
              <p className="mt-3">
                Badminton and related physical activity carry an inherent risk of injury,
                including from collisions, falls, overexertion, and equipment. Pavilion does not
                organize, staff, supervise, or insure sessions or venues, and does not perform
                background checks on other users. When you RSVP to or host a session, you do so
                voluntarily and assume all risks associated with attending, including risks
                arising from the conduct of other players, venue conditions, and the activity
                itself.
              </p>
              <p className="mt-3">
                To the fullest extent permitted by law, you release Pavilion, its operators, and
                affiliates from claims, damages, or injuries arising from your participation in
                sessions or interactions with other users found through the app. Nothing here
                waives claims that can&apos;t be waived under applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">6. Ratings and Verification</h2>
              <p className="mt-3">
                Skill ratings are generated from peer input and, for pro-tier status, submitted
                verification credentials. They reflect community judgment, not a guarantee of any
                player&apos;s actual skill or conduct. Don&apos;t rely on a rating as a safety or
                background assurance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">7. Conduct</h2>
              <p className="mt-3">You agree not to:</p>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li>Harass, threaten, or discriminate against other users</li>
                <li>Post false venue information or misrepresent your skill level in bad faith</li>
                <li>Coordinate with others to manipulate ratings</li>
                <li>Use the app for any unlawful purpose</li>
              </ul>
              <p className="mt-3">
                We may suspend or terminate accounts that violate these terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">
                8. Disclaimers &amp; Limitation of Liability
              </h2>
              <p className="mt-3">
                Pavilion is provided &ldquo;as is,&rdquo; without warranties of any kind, including
                that venue information is accurate or that sessions will occur as planned. To the
                fullest extent permitted by law, Pavilion and its operators aren&apos;t liable for
                indirect, incidental, or consequential damages, or for the acts of other users or
                venues encountered through the app.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">9. Changes</h2>
              <p className="mt-3">
                We may update these terms as the app evolves. Continued use after an update means
                you accept the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">10. Governing Law</h2>
              <p className="mt-3">These terms are governed by the laws of {GOVERNING_LAW}.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-900">11. Contact</h2>
              <p className="mt-3">
                Questions about these terms? Reach us at{' '}
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
