// Reward Types
export type RewardType = 'saas_offset' | 'compute_credit';

export type RewardRedemptionStatus =
  | 'pending'
  | 'issued'
  | 'activated'
  | 'expired'
  | 'refunded';

// Reward Tier
export interface RewardTier {
  slug: string;
  name: string;
  description: string;
  creditsRequired: number;
  valueDescription: string;
  available?: number;
}

// Partner Reward
export interface PartnerReward {
  id: string;
  partnerSlug: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  rewardType: RewardType;
  tiers: RewardTier[];
  creditsRequiredMin: number;
  creditsRequiredMax: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Reward Redemption
export interface RewardRedemption {
  id: string;
  userId: string;
  partnerRewardId: string;
  tierSlug: string;
  creditsSpent: number;
  codeIssued?: string;
  status: RewardRedemptionStatus;
  issuedAt: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  partner?: PartnerReward;
}

// API Responses
export interface RewardPartnersResponse {
  data: PartnerReward[];
}

export interface RewardPartnerDetailResponse {
  data: PartnerReward;
}

export interface RewardRedemptionsResponse {
  data: RewardRedemption[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface RewardRedemptionDetailResponse {
  data: RewardRedemption;
}

export interface RedeemRewardResponse {
  data: {
    redemption: RewardRedemption;
    code: string;
    newBalance: number;
  };
}

// Filters
export interface RewardFilters {
  rewardType?: RewardType;
}

export interface RedemptionFilters {
  status?: RewardRedemptionStatus;
  limit?: number;
  offset?: number;
}

// Display helpers
export const rewardTypeLabels: Record<RewardType, string> = {
  saas_offset: 'SaaS Credits',
  compute_credit: 'Compute Credits',
};

export const rewardTypeDescriptions: Record<RewardType, string> = {
  saas_offset: 'Hosting, database, and platform credits',
  compute_credit: 'Cloud and GPU compute resources',
};

export const redemptionStatusLabels: Record<RewardRedemptionStatus, string> = {
  pending: 'Pending',
  issued: 'Issued',
  activated: 'Activated',
  expired: 'Expired',
  refunded: 'Refunded',
};

export const redemptionStatusColors: Record<RewardRedemptionStatus, string> = {
  pending: 'bg-yellow-500',
  issued: 'bg-green-500',
  activated: 'bg-blue-500',
  expired: 'bg-gray-500',
  refunded: 'bg-red-500',
};

// Utility functions
export function formatCreditsRequired(credits: number): string {
  return new Intl.NumberFormat('en-US').format(credits);
}

export function getPartnerLogoFallback(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function getTierAvailabilityStatus(available: number | undefined): {
  label: string;
  color: string;
} {
  if (available === undefined || available > 10) {
    return { label: 'Available', color: 'text-green-500' };
  }
  if (available > 0) {
    return { label: `Only ${available} left`, color: 'text-yellow-500' };
  }
  return { label: 'Out of stock', color: 'text-red-500' };
}
