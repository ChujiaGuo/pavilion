import Link from 'next/link';
import { AppNav } from './app-nav';

const content = 'relative mx-auto px-6 sm:px-10 lg:px-12';

// Shared chrome for authenticated app pages (home, venues, sessions,
// players, profile): the nav from AppNav (which includes the Profile
// destination) plus a header linking back to /home. Content gets bottom
// padding on mobile to clear the fixed bottom tab bar, and left padding
// at `sm`+ to clear the sidebar — see AppNav.
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-[linear-gradient(180deg,#eafcee_0%,#ffffff_30%)] pb-24 text-neutral-900 sm:pb-0 sm:pl-20 lg:pl-64">
      <AppNav />

      <header className={`flex items-center py-6 ${content}`}>
        <Link href="/home" className="text-lg font-semibold text-primary">
          Pavilion
        </Link>
      </header>

      <div className={`${content} pb-16`}>{children}</div>
    </main>
  );
}
