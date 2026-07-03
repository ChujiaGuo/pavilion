import Link from 'next/link';
import type { Session } from '@pavilion/types';
import {
  SESSION_TYPE_LABELS,
  SESSION_FORMAT_LABELS,
  formatSessionDateTime,
  formatSkillRange,
} from '@/lib/session-format';

// Editorial list-item style (no bounding box) — matches home/page.tsx's
// recent-activity list rather than a boxed shadcn Card.
export function SessionCard({ session }: { session: Session }) {
  return (
    <Link
      href={`/sessions/${session.id}`}
      className="block border-b border-border py-4 first:pt-0 last:border-b-0"
    >
      <p className="font-medium">{session.venueName}</p>
      <p className="mt-0.5 text-sm text-neutral-600">{formatSessionDateTime(session.startsAt)}</p>
      <p className="mt-1 text-sm text-neutral-500">
        {SESSION_TYPE_LABELS[session.type]} · {SESSION_FORMAT_LABELS[session.format]} · Skill{' '}
        {formatSkillRange(session.skillMin, session.skillMax)}
      </p>
    </Link>
  );
}
