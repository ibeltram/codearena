/**
 * Types for Admin Audit Log Explorer
 */

// Audit event categories
export type AuditCategory =
  | 'auth'
  | 'admin'
  | 'moderation'
  | 'payment'
  | 'match'
  | 'submission'
  | 'challenge'
  | 'tournament'
  | 'reward'
  | 'system';

// User info in audit events
export interface AuditActor {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

// Audit event in list view
export interface AuditEvent {
  id: string;
  actorUserId: string | null;
  category: AuditCategory;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  requestId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

// Audit event detail view
export interface AuditEventDetail {
  id: string;
  actor: AuditActor | null;
  category: AuditCategory;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

// List response
export interface AuditEventsResponse {
  data: AuditEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Entity audit trail response
export interface EntityAuditTrailResponse {
  entityType: string;
  entityId: string;
  events: AuditEvent[];
}

// User audit trail response
export interface UserAuditTrailResponse {
  user: AuditActor;
  events: AuditEvent[];
}

// Audit stats response
export interface AuditStatsResponse {
  period: string;
  totalEvents: number;
  byCategory: Record<AuditCategory, number>;
  byEventType: Record<string, number>;
  topActors: Array<{
    userId: string;
    count: number;
  }>;
}

// Export response
export interface AuditExportResponse {
  exportedAt: string;
  filters: AuditFilters;
  totalEvents: number;
  events: AuditEvent[];
}

// Filters
export interface AuditFilters {
  page?: number;
  limit?: number;
  actorUserId?: string;
  category?: AuditCategory;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
}

// Display helpers
export const categoryLabels: Record<AuditCategory, string> = {
  auth: 'Authentication',
  admin: 'Admin',
  moderation: 'Moderation',
  payment: 'Payment',
  match: 'Match',
  submission: 'Submission',
  challenge: 'Challenge',
  tournament: 'Tournament',
  reward: 'Reward',
  system: 'System',
};

export const categoryColors: Record<AuditCategory, string> = {
  auth: 'bg-blue-500',
  admin: 'bg-purple-500',
  moderation: 'bg-red-500',
  payment: 'bg-green-500',
  match: 'bg-orange-500',
  submission: 'bg-yellow-500',
  challenge: 'bg-cyan-500',
  tournament: 'bg-pink-500',
  reward: 'bg-indigo-500',
  system: 'bg-gray-500',
};

export const categoryIcons: Record<AuditCategory, string> = {
  auth: 'key',
  admin: 'shield',
  moderation: 'flag',
  payment: 'credit-card',
  match: 'swords',
  submission: 'upload',
  challenge: 'code',
  tournament: 'trophy',
  reward: 'gift',
  system: 'settings',
};
