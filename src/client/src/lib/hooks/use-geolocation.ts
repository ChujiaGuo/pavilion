'use client';

import { useCallback, useState } from 'react';

export type GeolocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported';

export interface GeolocationResult {
  status: GeolocationStatus;
  coords: { lat: number; lng: number } | null;
  // Kicks off the browser's geolocation permission flow -- callers invoke
  // this in direct response to a user action (e.g. picking a Distance
  // radius on /venues) rather than on mount, so the native permission
  // prompt only ever appears once the user has actually asked for
  // distance-based results (see technical-notes.md). A no-op while already
  // 'loading' or 'granted'. Denial/unavailability degrades to 'denied'/
  // 'unsupported' rather than throwing -- callers fall back to a
  // non-distance-sorted listing (see brainstorm.md's "fallback to no
  // filters/name filter if permission is denied").
  request: () => void;
}

export function useGeolocation(): GeolocationResult {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const request = useCallback(() => {
    if (status === 'loading' || status === 'granted') return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return { status, coords, request };
}
