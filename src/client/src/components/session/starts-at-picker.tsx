'use client';

import { useState } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react';
import { useMediaQuery } from '@base-ui/react/unstable-use-media-query';
import { CalendarClock } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { fieldClassName, labelClassName } from './field-styles';
import { formatSessionDateTime, todayIso } from '@/lib/session-format';
import { QUICK_TIMES, formatTimeLabel } from '@/lib/time-of-day';
import { cn } from '@/lib/utils';

interface StartsAtPickerProps {
  value: string; // 'YYYY-MM-DDTHH:mm', same shape <input type="datetime-local"> used
  onChange: (value: string) => void;
}

// Replaces a plain <input type="datetime-local"> — on mobile, browsers often
// render that as fiddly nested year/month/day/hour/minute segments to tab
// through one at a time. This splits the same value into a native
// <input type="date"> (mobile browsers already give that a clean calendar/
// wheel UI) plus quick-tap time-of-day pills, disclosed the same
// responsive way as the Browse filter's "More filters": a bottom Drawer
// below `sm`, an anchored Popover dropdown at `sm` and up.
export function StartsAtPicker({ value, onChange }: StartsAtPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 640px)', { noSsr: true });

  const [datePart, timePart] = value ? (value.split('T') as [string, string]) : ['', '18:00'];

  function commit(nextDate: string, nextTime: string) {
    if (!nextDate) return;
    onChange(`${nextDate}T${nextTime}`);
  }

  const summary = datePart ? formatSessionDateTime(`${datePart}T${timePart}`) : 'Set date & time';

  const pickerContent = (
    <div className="space-y-6">
      <div>
        <label htmlFor="startsAtDate" className={labelClassName}>
          Date
        </label>
        <input
          id="startsAtDate"
          type="date"
          value={datePart}
          onChange={(e) => commit(e.target.value, timePart)}
          className={fieldClassName}
        />
      </div>
      <div>
        <span className={labelClassName}>Time</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_TIMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => commit(datePart || todayIso(), t)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                timePart === t
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-neutral-600 hover:bg-muted',
              )}
            >
              {formatTimeLabel(t)}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label htmlFor="startsAtCustomTime" className={cn(labelClassName, 'normal-case tracking-normal text-neutral-400')}>
            Or pick an exact time
          </label>
          <input
            id="startsAtCustomTime"
            type="time"
            value={timePart}
            onChange={(e) => commit(datePart || todayIso(), e.target.value)}
            className={fieldClassName}
          />
        </div>
      </div>
    </div>
  );

  const trigger = (
    <>
      <span className={value ? '' : 'text-neutral-400'}>{summary}</span>
      <CalendarClock className="size-4 shrink-0 text-neutral-400" aria-hidden />
    </>
  );

  return (
    <div>
      <span className={labelClassName}>Starts at</span>
      {isDesktop ? (
        <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
          <PopoverPrimitive.Trigger className={cn(fieldClassName, 'flex items-center justify-between gap-2 text-left cursor-pointer')}>
            {trigger}
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={8} className="z-50">
              <PopoverPrimitive.Popup
                data-slot="starts-at-popover-popup"
                className="w-80 origin-(--transform-origin) rounded-lg bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">Starts at</p>
                <div className="mt-4">{pickerContent}</div>
                <div className="mt-6 flex justify-end">
                  <Button type="button" size="sm" onClick={() => setIsOpen(false)}>
                    Done
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
            className={cn(fieldClassName, 'flex items-center justify-between gap-2 text-left cursor-pointer')}
          >
            {trigger}
          </button>
          <Drawer open={isOpen} onOpenChange={setIsOpen}>
            <DrawerContent aria-label="Choose date and time">
              <DrawerHeader>
                <DrawerTitle className="font-sans text-sm font-semibold uppercase tracking-[0.15em] text-neutral-500">
                  Starts at
                </DrawerTitle>
                <DrawerDescription>Pick a date and a start time.</DrawerDescription>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto px-4 py-4">{pickerContent}</div>
              <DrawerFooter>
                <Button type="button" onClick={() => setIsOpen(false)}>
                  Done
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </>
      )}
    </div>
  );
}
