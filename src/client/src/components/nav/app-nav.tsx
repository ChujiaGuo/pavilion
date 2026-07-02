'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MapPin, CalendarDays, User, type LucideIcon } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/home', label: 'Home', shortLabel: 'Home', icon: Home },
  { href: '/sessions', label: 'Sessions', shortLabel: 'Sessions', icon: CalendarDays },
  { href: '/venues', label: 'Nearby venues', shortLabel: 'Venues', icon: MapPin },
  { href: '/profile', label: 'Profile', shortLabel: 'Profile', icon: User },
];

// Bottom tab bar below `sm` (mobile-first primary case), left sidebar at
// `sm` and up — see design-system.md "Platform". Both read the same
// NAV_ITEMS so the destinations (dashboard, session search/list, nearby
// venues, profile) stay in sync across breakpoints.
export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-border bg-white/95 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
      >
        {NAV_ITEMS.map(({ href, shortLabel, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 px-4 py-1 text-xs font-medium ${
                isActive ? 'text-primary' : 'text-neutral-500'
              }`}
            >
              <Icon className="size-5" aria-hidden />
              {shortLabel}
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Primary"
        className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col items-center gap-2 border-r border-border bg-white/95 py-8 backdrop-blur sm:flex lg:w-64 lg:items-stretch lg:px-6"
      >
        <Link
          href="/home"
          className="mb-8 hidden text-lg font-semibold text-primary lg:block"
        >
          Pavilion
        </Link>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors lg:w-full ${
                isActive ? 'bg-primary/10 text-primary' : 'text-neutral-600 hover:bg-muted'
              }`}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {/* Screen-reader-only between `sm` and `lg`, where the sidebar is
                  icon-only — otherwise the link would have no accessible name. */}
              <span className="sr-only lg:not-sr-only lg:inline">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
