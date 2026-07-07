import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Session } from '@pavilion/types';
import {
  SESSION_TYPE_LABELS,
  SESSION_FORMAT_LABELS,
  formatSessionDateTime,
  formatSkillRange,
} from '@/lib/session-format';

// Editorial list-item style (no bounding box) — matches home/page.tsx's
// recent-activity list rather than a boxed shadcn Card. Hover + chevron
// affordance matches the admin panel's row convention (admin-venues-panel.tsx).
export function SessionCard({ session }: { session: Session }) {
  return (
    <Link
      href={`/sessions/${session.id}`}
      className="-mx-2 flex items-center justify-between gap-3 rounded-lg border-b border-border px-2 py-4 transition-colors first:pt-0 last:border-b-0 hover:bg-muted"
    >
      <div>
        <p className="font-medium">{session.venueName}</p>
        <p className="mt-0.5 text-sm text-neutral-600">{formatSessionDateTime(session.startsAt)}</p>
        <p className="mt-1 text-sm text-neutral-500">
          {SESSION_TYPE_LABELS[session.type]} · {SESSION_FORMAT_LABELS[session.format]} · Skill{' '}
          {formatSkillRange(session.skillMin, session.skillMax)}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-neutral-400" />
    </Link>
  );
}
