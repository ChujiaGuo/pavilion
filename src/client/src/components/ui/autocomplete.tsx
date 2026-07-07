"use client"

import * as React from "react"
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react"

import { cn } from "@/lib/utils"

// Hand-built wrapper, not shadcn-generated -- same category as InfoTooltip
// (see design-system.md's Component Library). @base-ui/react's Autocomplete
// namespace (distinct from the Combobox namespace combobox.tsx wraps) is a
// free-text input + suggestion dropdown with no persisted "selected value":
// typing is never overwritten by the component itself, and Autocomplete.Item
// takes a plain onClick. That's the right fit for "type freely, optionally
// click a suggestion to fill/enrich the field" -- venue search (free text
// stays a valid 'unofficial venue' name) and Google Places address search
// (free text is meaningless there, but the input still shouldn't fight the
// user while Places is unconfigured) both want this over Combobox's
// selected-value model.
//
// Several Autocomplete parts are direct re-exports of the same Combobox
// primitives combobox.tsx already wraps (Input, Positioner, Popup, Portal,
// List, Empty, Collection) -- only Root and Item differ. Visual conventions
// (rounded popup, shadow-md, ring-1 ring-foreground/10, the same
// data-open/data-closed animation classes) are copied from combobox.tsx so
// every dropdown in the app reads as one visual system.
const Autocomplete = AutocompletePrimitive.Root

function AutocompleteInput({
  className,
  ...props
}: AutocompletePrimitive.Input.Props) {
  return (
    <AutocompletePrimitive.Input
      data-slot="autocomplete-input"
      className={cn(className)}
      {...props}
    />
  )
}

function AutocompleteContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  ...props
}: AutocompletePrimitive.Popup.Props &
  Pick<AutocompletePrimitive.Positioner.Props, "side" | "align" | "sideOffset" | "alignOffset">) {
  return (
    <AutocompletePrimitive.Portal>
      <AutocompletePrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <AutocompletePrimitive.Popup
          data-slot="autocomplete-content"
          className={cn(
            "max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[12rem] origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  )
}

function AutocompleteList({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      data-slot="autocomplete-list"
      className={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className
      )}
      {...props}
    />
  )
}

// Padding bumped over combobox.tsx's ComboboxItem (py-1) to py-3 -- a ~44px
// tap target, per design-system.md's mobile-first / finger-friendly
// direction, since these dropdowns (venue search, address search) are used
// on the create-session and admin-venue-creation forms on mobile.
function AutocompleteItem({ className, children, ...props }: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        "flex min-h-11 w-full cursor-default items-center rounded-md px-3 py-3 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  )
}

function AutocompleteEmpty({ className, ...props }: AutocompletePrimitive.Empty.Props) {
  return (
    <AutocompletePrimitive.Empty
      data-slot="autocomplete-empty"
      className={cn(
        "hidden w-full justify-center px-3 py-3 text-center text-sm text-muted-foreground group-data-empty/autocomplete-content:flex",
        className
      )}
      {...props}
    />
  )
}

function AutocompleteCollection({ ...props }: AutocompletePrimitive.Collection.Props) {
  return <AutocompletePrimitive.Collection data-slot="autocomplete-collection" {...props} />
}

export {
  Autocomplete,
  AutocompleteInput,
  AutocompleteContent,
  AutocompleteList,
  AutocompleteItem,
  AutocompleteEmpty,
  AutocompleteCollection,
}
