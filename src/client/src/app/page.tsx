const pillars = [
  {
    title: 'Find a venue',
    description:
      'Browse local courts and clubs, see hours, pricing, and whether it’s drop-in or reservation-only.',
  },
  {
    title: 'Join or host a session',
    description:
      'RSVP to drop-ins or organize your own. See the skill range up front so you know what you’re walking into.',
  },
  {
    title: 'Get rated by your peers',
    description:
      'After each session, players rate relative skill. Your grade reflects how you actually play, not a self-reported number.',
  },
];

// Real content stays in this centered column on desktop.
const content = 'relative mx-auto px-6 sm:px-12 lg:w-2/3 lg:px-0';

// Decorative background typography lives in its own breathing-room band between
// sections — never behind real copy — sized with clamp() so it scales continuously
// with viewport width instead of jumping at a breakpoint and risking clipping on
// narrow screens. Alternates left/right per instance instead of dead-centering every
// one, to keep the asymmetry rather than repeating the same placement three times.
function Watermark({ children, align }: { children: string; align: 'left' | 'right' }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none mx-auto flex w-3/4 items-center overflow-hidden py-8 sm:py-14 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      <span className="text-[clamp(3.5rem,14vw,9rem)] font-black leading-none text-primary/10">
        {children}
      </span>
    </div>
  );
}

export default function Home() {
  return (
    <main className="relative overflow-x-hidden bg-[linear-gradient(180deg,#eafcee_0%,#ffffff_22%,#f4f5f4_45%,#eafcee_68%,#ffffff_100%)] text-neutral-900">
      <header className={`flex items-center py-6 ${content}`}>
        <span className="text-lg font-semibold text-primary">Pavilion</span>
      </header>

      {/* Hero — asymmetric: headline anchors the left, subhead/CTA offset lower-right */}
      <section className="relative pt-20 pb-16 sm:pt-32 sm:pb-24">
        <div className={content}>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            Maryland
          </p>
          <div className="mt-6 grid grid-cols-1 gap-10 sm:grid-cols-12">
            <h1 className="col-span-1 text-5xl font-bold leading-[1.05] tracking-tight sm:col-span-8 sm:text-7xl">
              Badminton,
              <br />
              organized.
            </h1>
            <div className="col-span-1 sm:col-span-4 sm:col-start-9 sm:self-end">
              <p className="text-lg text-neutral-700">
                Find courts near you, join sessions matched to your skill level, and know who’s
                showing up before you do.
              </p>
              <div className="mt-6 flex items-center gap-4">
                <a
                  href="/signup"
                  className="inline-block rounded-full bg-primary px-6 py-3 font-medium text-white shadow-md transition-shadow hover:shadow-lg"
                >
                  Get Started
                </a>
                <a
                  href="/login"
                  className="inline-block rounded-full bg-white px-6 py-3 font-medium text-primary shadow-md transition-shadow hover:shadow-lg"
                >
                  Log in
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Watermark align="right">RALLY</Watermark>

      {/* How it works — each pillar alternates sides instead of sitting in a grid of cards */}
      <section className="relative py-16 sm:py-24">
        <div className={content}>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            How it works
          </h2>
          <div className="mt-14 space-y-16 sm:space-y-24">
            {pillars.map((pillar, i) => {
              const isOdd = i % 2 === 1;
              return (
                <div
                  key={pillar.title}
                  className={`flex flex-col gap-4 sm:flex-row sm:items-baseline sm:gap-10 ${
                    isOdd ? 'sm:justify-end' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className="text-6xl font-black leading-none text-primary/30 sm:text-8xl"
                  >
                    {`0${i + 1}`}
                  </span>
                  <div className={`max-w-md ${isOdd ? 'sm:text-right' : ''}`}>
                    <h3 className="text-2xl font-semibold sm:text-3xl">{pillar.title}</h3>
                    <p className="mt-3 text-neutral-600">{pillar.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Launch regions — flowing typographic list, not chip pills */}
      <section className="relative py-16 sm:py-24">
        <div className={content}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Starting in
            </h2>
            <p className="text-3xl font-semibold leading-tight tracking-tight sm:text-right sm:text-6xl">
              Maryland
            </p>
          </div>
        </div>
      </section>

      {/* Rating teaser — giant numeral grouped in the same row as the description, not floating separately */}
      <section className="relative py-16 sm:py-24">
        <div className={content}>
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <span
              aria-hidden
              className="text-[clamp(3.5rem,14vw,9rem)] font-black leading-none text-primary/10"
            >
              10.0
            </span>
            <div className="max-w-xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                Skill rating
              </p>
              <h2 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
                A rating that reflects how you play.
              </h2>
              <p className="mt-6 text-lg text-neutral-600">
                Ratings run from beginner to elite, shown as a grade and tier — not a raw number
                to obsess over. Your first few sessions place you quickly; peer ratings keep it
                accurate after that.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Watermark align="right">GO</Watermark>

      {/* Closing CTA — the canvas bleeds from transparent into a solid dark green */}
      <section className="relative overflow-hidden bg-gradient-to-b from-transparent via-primary via-[20%] to-[#12341f] pt-24 pb-28 text-white sm:pt-32 sm:pb-40">
        <div className={content}>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Get in</p>
          <h2 className="mt-4 text-5xl font-bold leading-tight sm:text-7xl">
            Ready to find your next session?
          </h2>
          <a
            href="/signup"
            className="mt-8 inline-block rounded-full bg-white px-6 py-3 font-medium text-primary shadow-md transition-shadow hover:shadow-lg"
          >
            Get Started
          </a>
        </div>

        <div
          className={`mt-24 flex flex-col gap-3 border-t border-white/15 pt-6 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between ${content}`}
        >
          <span>&copy; {new Date().getFullYear()} Pavilion</span>
          <div className="flex gap-6">
            <a href="/terms" className="hover:text-white">
              Terms of Service
            </a>
            <a href="/privacy" className="hover:text-white">
              Privacy Policy
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
