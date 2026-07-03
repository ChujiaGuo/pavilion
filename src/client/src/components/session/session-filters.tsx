'use client';

import { useState } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react';
import { useMediaQuery } from '@base-ui/react/unstable-use-media-query';
import { SlidersHorizontal } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateRangeSummary } from '@/lib/session-format';
import { fieldClassName, labelClassName } from './field-styles';

export interface BrowseFilters {
  city: string;
  dateFrom: string;
  dateTo: string;
  skillMin: string;
  skillMax: string;
}

export interface SkillDefaults {
  skillMin: string;
  skillMax: string;
}

const pillTriggerClassName =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-muted';

interface SkillFilterFieldsProps {
  draft: BrowseFilters;
  onChange: (patch: Partial<BrowseFilters>) => void;
}

function SkillFilterFields({ draft, onChange }: SkillFilterFieldsProps) {
  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="filter-skill-min" className={labelClassName}>
          Skill min
        </label>
        <input
          id="filter-skill-min"
          type="number"
          step="0.25"
          min="1"
          value={draft.skillMin}
          onChange={(e) => onChange({ skillMin: e.target.value })}
          className={fieldClassName}
        />
      </div>
      <div>
        <label htmlFor="filter-skill-max" className={labelClassName}>
          Skill max
        </label>
        <input
          id="filter-skill-max"
          type="number"
          step="0.25"
          value={draft.skillMax}
          onChange={(e) => onChange({ skillMax: e.target.value })}
          className={fieldClassName}
        />
      </div>
    </div>
  );
}

interface SessionFiltersProps {
  value: BrowseFilters;
  /** The signed-in user's own computed skill floor/ceiling — see session-format.ts's
   * `computeDefaultSkillRange` — used by "Reset to defaults", not a global constant. */
  skillDefaults: SkillDefaults;
  onApply: (filters: BrowseFilters) => void;
}

// City and Date are the primary, always-visible interactions (per
// design-system.md's mobile-first priority hierarchy); Skill min/max are
// secondary refinements tucked behind "More filters". Disclosure is
// responsive: a bottom-anchored Drawer (slide-up sheet, swipe-to-dismiss)
// below the `sm` breakpoint, a Popover-based dropdown at `sm` and up —
// matching AppNav's existing bottom-tab-bar/sidebar split rather than
// forcing one interaction pattern onto both form factors.
export function SessionFilters({ value, skillDefaults, onApply }: SessionFiltersProps) {
  const [draft, setDraft] = useState<BrowseFilters>(value);
  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 640px)', { noSsr: true });

  const hasNarrowedSkill = draft.skillMin !== skillDefaults.skillMin || draft.skillMax !== skillDefaults.skillMax;
  // YYYY-MM-DD strings compare correctly lexicographically — no Date parsing needed.
  const isDateRangeInvalid = draft.dateFrom !== '' && draft.dateTo !== '' && draft.dateTo < draft.dateFrom;

  function handleDraftChange(patch: Partial<BrowseFilters>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function handlePrimarySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isDateRangeInvalid) return;
    onApply(draft);
  }

  function handleOverlayApply() {
    if (isDateRangeInvalid) return;
    onApply(draft);
    setIsOpen(false);
  }

  function handleReset() {
    const reset: BrowseFilters = { ...draft, skillMin: skillDefaults.skillMin, skillMax: skillDefaults.skillMax };
    setDraft(reset);
    onApply(reset);
    setIsOpen(false);
  }

  const trigger = (
    <>
      <SlidersHorizontal className="size-4" aria-hidden />
      More filters
      {hasNarrowedSkill && (
        <span className="size-1.5 shrink-0 rounded-full bg-primary" role="status" aria-label="Additional filters active" />
      )}
    </>
  );

  return (
    <form onSubmit={handlePrimarySubmit} className="flex flex-wrap items-start gap-x-6 gap-y-4">
      <div className="min-w-[9rem] flex-1 basis-40">
        <label htmlFor="filter-city" className={labelClassName}>
          City
        </label>
        <input
          id="filter-city"
          type="text"
          placeholder="Any city"
          value={draft.city}
          onChange={(e) => handleDraftChange({ city: e.target.value })}
          className={fieldClassName}
        />
      </div>

      <div className="min-w-full flex-1 basis-full sm:min-w-[16rem] sm:basis-64">
        {/* Not htmlFor-bound to a single control — it labels the pair of
            date inputs below, each of which carries its own aria-label. */}
        <span className={labelClassName}>Date</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="filter-date-from"
            type="date"
            aria-label="From date"
            value={draft.dateFrom}
            onChange={(e) => handleDraftChange({ dateFrom: e.target.value })}
            className={cn(fieldClassName, 'mt-0 w-auto min-w-0 flex-1')}
          />
          <span className="text-neutral-400" aria-hidden>
            –
          </span>
          <input
            id="filter-date-to"
            type="date"
            aria-label="To date"
            value={draft.dateTo}
            onChange={(e) => handleDraftChange({ dateTo: e.target.value })}
            className={cn(fieldClassName, 'mt-0 w-auto min-w-0 flex-1')}
          />
        </div>
        <p className={cn('mt-1 text-xs', isDateRangeInvalid ? 'text-destructive' : 'text-neutral-500')} aria-live="polite">
          {isDateRangeInvalid
            ? `${formatDateRangeSummary(draft.dateFrom, draft.dateTo)} — end date can't be before the start date`
            : formatDateRangeSummary(draft.dateFrom, draft.dateTo)}
        </p>
      </div>

      {/* Invisible label-height spacer so this column's buttons line up with
          the City/Date *inputs* rather than the row's top edge — the row
          aligns from the top (`items-start`) so Date's extra caption line
          doesn't drag the shorter columns down with it. */}
      <div className="flex shrink-0 flex-col">
        <span className={cn(labelClassName, 'invisible')} aria-hidden>
          Actions
        </span>
        <div className="mt-1 flex items-center gap-3">
          {isDesktop ? (
            <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
              <PopoverPrimitive.Trigger className={pillTriggerClassName}>{trigger}</PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
                  <PopoverPrimitive.Popup
                    data-slot="filter-popover-popup"
                    className="w-72 origin-(--transform-origin) rounded-lg bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                    <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">More filters</p>
                    <div className="mt-4">
                      <SkillFilterFields draft={draft} onChange={handleDraftChange} />
                    </div>
                    <div className="mt-6 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="text-sm font-medium text-neutral-500 hover:text-neutral-700 hover:underline"
                      >
                        Reset to defaults
                      </button>
                      <Button type="button" size="sm" disabled={isDateRangeInvalid} onClick={handleOverlayApply}>
                        Apply
                      </Button>
                    </div>
                  </PopoverPrimitive.Popup>
                </PopoverPrimitive.Positioner>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                className={pillTriggerClassName}
              >
                {trigger}
              </button>
              <Drawer open={isOpen} onOpenChange={setIsOpen}>
                <DrawerContent aria-label="More filters">
                  <DrawerHeader>
                    <DrawerTitle className="font-sans text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
                      More filters
                    </DrawerTitle>
                    <DrawerDescription>Narrow sessions down by skill level.</DrawerDescription>
                  </DrawerHeader>
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    <SkillFilterFields draft={draft} onChange={handleDraftChange} />
                  </div>
                  <DrawerFooter className="flex-row items-center justify-between">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-sm font-medium text-neutral-500 hover:text-neutral-700 hover:underline"
                    >
                      Reset to defaults
                    </button>
                    <Button type="button" disabled={isDateRangeInvalid} onClick={handleOverlayApply}>
                      Apply
                    </Button>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            </>
          )}

          <button
            type="submit"
            disabled={isDateRangeInvalid}
            className="shrink-0 rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-md transition-shadow hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Search
          </button>
        </div>
      </div>
    </form>
  );
}
