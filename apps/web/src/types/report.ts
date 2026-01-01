// Report reason types
export type ReportReason = 'cheating' | 'harassment' | 'inappropriate_content' | 'spam' | 'other';

// Report status types
export type ReportStatus = 'pending' | 'in_review' | 'resolved' | 'dismissed';

// Report resolution actions
export type ReportResolutionAction = 'no_action' | 'warning_issued' | 'temp_ban' | 'permanent_ban' | 'other';

// User info in reports
export interface ReportUser {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string | null;
}

// Evidence attached to a report
export interface ReportEvidence {
  matchId?: string;
  screenshots?: string[];
  links?: string[];
  additionalContext?: string;
}

// Report list item
export interface ReportListItem {
  id: string;
  reason: ReportReason;
  reasonLabel: string;
  description: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  reporter: ReportUser;
  reportedUser: ReportUser;
  reviewedBy: ReportUser | null;
}

// Report detail
export interface ReportDetail extends ReportListItem {
  evidenceJson: ReportEvidence;
  reviewNotes: string | null;
}

// Reports list response
export interface ReportsResponse {
  data: ReportListItem[];
  summary: {
    pending: number;
    inReview: number;
    resolved: number;
    dismissed: number;
    total: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Report detail response
export interface ReportDetailResponse {
  report: ReportDetail;
  auditHistory: ReportAuditItem[];
  otherReports: Array<{
    id: string;
    reason: ReportReason;
    status: ReportStatus;
    createdAt: string;
  }>;
}

// Report audit history item
export interface ReportAuditItem {
  id: string;
  eventType: string;
  payloadJson: Record<string, unknown>;
  createdAt: string;
  actor: Pick<ReportUser, 'id' | 'displayName'> | null;
}

// Report filters
export interface ReportFilters {
  page?: number;
  limit?: number;
  status?: ReportStatus;
  reason?: ReportReason;
  reportedUserId?: string;
}

// Update status input
export interface UpdateReportStatusInput {
  status: 'in_review' | 'pending';
}

// Resolve report input
export interface ResolveReportInput {
  resolution: 'resolved' | 'dismissed';
  action: ReportResolutionAction;
  notes?: string;
  banDurationDays?: number;
}

// Update status response
export interface UpdateReportStatusResponse {
  id: string;
  status: ReportStatus;
  message: string;
}

// Resolve report response
export interface ResolveReportResponse {
  id: string;
  status: ReportStatus;
  resolution: 'resolved' | 'dismissed';
  action: ReportResolutionAction;
  message: string;
  actionTaken?: {
    type: string;
    targetUserId: string;
    details: string;
  };
}

// Report stats
export interface ReportStats {
  total: number;
  pending: number;
  inReview: number;
  resolved: number;
  dismissed: number;
  byReason: Record<ReportReason, number>;
  last7Days: number;
  last30Days: number;
}

// Display helpers
export const reasonLabels: Record<ReportReason, string> = {
  cheating: 'Cheating',
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate Content',
  spam: 'Spam',
  other: 'Other',
};

export const reasonColors: Record<ReportReason, string> = {
  cheating: 'bg-red-500',
  harassment: 'bg-orange-500',
  inappropriate_content: 'bg-purple-500',
  spam: 'bg-gray-500',
  other: 'bg-blue-500',
};

export const statusLabels: Record<ReportStatus, string> = {
  pending: 'Pending',
  in_review: 'In Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export const statusColors: Record<ReportStatus, string> = {
  pending: 'bg-yellow-500',
  in_review: 'bg-blue-500',
  resolved: 'bg-green-500',
  dismissed: 'bg-gray-500',
};

export const actionLabels: Record<ReportResolutionAction, string> = {
  no_action: 'No Action Taken',
  warning_issued: 'Warning Issued',
  temp_ban: 'Temporary Ban',
  permanent_ban: 'Permanent Ban',
  other: 'Other Action',
};
