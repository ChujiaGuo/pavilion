// Guards against an open redirect via a crafted `?next=` value on /login,
// which is reachable by anyone (not just links this app generated itself).
// Must be a same-origin relative path: starts with a single `/`, not `//`
// (protocol-relative) or `/\` (browsers treat as protocol-relative too), and
// contains no `://`.
export function isSafeNextPath(next: string | null): next is string {
  if (!next) return false;
  if (!next.startsWith('/')) return false;
  if (next.startsWith('//') || next.startsWith('/\\')) return false;
  if (next.includes('://')) return false;
  return true;
}
