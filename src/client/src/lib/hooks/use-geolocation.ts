'use client';

import { useEffect, useState } from 'react';

export type GeolocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported';

export interface GeolocationResult {
  status: GeolocationStatus;
  coords: { lat: number; lng: number } | null;
}

// Requests the browser's geolocation permission once on mount -- feeds
// /venues' distance filter (see technical-notes.md). No user gesture is
// required for navigator.geolocation.getCurrentPosition, so this can run
// silently; the browser's own native permission prompt is the actual
// user-facing confirmation step. Denial/unavailability degrades to 'denied'/
// 'unsupported' rather than throwing -- callers fall back to a
// non-distance-sorted listing (see brainstorm.md's "fallback to no filters/
// name filter if permission is denied").
export function useGeolocation(): GeolocationResult {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }
    setStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus('granted');
      },
      () => {
        setStatus('denied');
      },
    );
  }, []);

  return { status, coords };
}
