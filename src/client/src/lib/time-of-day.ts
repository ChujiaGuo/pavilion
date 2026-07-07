// Common drop-in/league start times — one-tap selection instead of scrolling
// a native <input type="time">'s hour/minute segments. Shared by
// starts-at-picker.tsx (session start time) and time-of-day-picker.tsx (venue
// open/close hours) so both read as the same picker, not two lookalikes.
export const QUICK_TIMES = ['06:00', '08:00', '09:00', '12:00', '15:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

export function formatTimeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}
