import { cn } from '@/lib/utils';

// Raw-typography input: a single underline rather than a bordered box, per
// design-system.md's editorial/formless direction. Focus state is a
// thicker, colored underline plus an offset outline — louder than a plain
// box-shadow ring so keyboard focus stays clearly visible without
// reintroducing a boxed look. Shared by session-filters.tsx and
// session-form-fields.tsx so the filter bar and the create/edit form read as
// one visual system rather than two different input styles.
export const fieldClassName = cn(
  'mt-1 w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-1.5 text-base text-neutral-900',
  'outline-none transition-colors placeholder:text-neutral-400',
  'focus-visible:border-b-2 focus-visible:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 focus-visible:outline-offset-4',
);

export const labelClassName = 'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500';
