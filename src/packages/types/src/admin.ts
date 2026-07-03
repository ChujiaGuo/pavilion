export type AdminRole = 'venue_verifier' | 'moderator' | 'admin' | 'owner';

export interface AdminGrant {
  userId: string;
  displayName: string;
  role: AdminRole;
  grantedBy: string | null;
  createdAt: string;
}

export type AdminHistoryDomain = 'role' | 'user' | 'session' | 'venue' | 'rating';

export interface AdminHistoryFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AdminHistoryEntry {
  id: string;
  domain: AdminHistoryDomain;
  action: string;
  targetLabel: string;
  performedByDisplayName: string;
  createdAt: string;
  changes: AdminHistoryFieldChange[] | null;
}
