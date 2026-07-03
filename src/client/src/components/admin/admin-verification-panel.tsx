// Placeholder only — the verification_requests approve/reject flow is
// explicitly deferred (see technical-notes.md's Rating System scope note).
// Matches the "coming soon" pattern already established on /home's Friends
// activity section rather than fabricating a working queue.
export function AdminVerificationPanel() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-5 text-neutral-500">
      Coming soon — a verification request queue (submit evidence → admin review) will live here.
    </div>
  );
}
