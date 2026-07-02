'use client';

import { Popover as PopoverPrimitive } from '@base-ui/react';
import { InfoIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function InfoTooltip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        openOnHover
        className={cn(
          'inline-flex size-4 items-center justify-center rounded-full text-neutral-400 outline-none hover:text-neutral-600 focus-visible:ring-3 focus-visible:ring-ring/50',
          className
        )}
      >
        <InfoIcon className="size-full" aria-hidden />
        <span className="sr-only">More info</span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="top" sideOffset={6} align="center" className="isolate z-50">
          <PopoverPrimitive.Popup className="w-64 origin-(--transform-origin) rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export { InfoTooltip };
