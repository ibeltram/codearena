// Credit Types
export type CreditTransactionType =
  | 'purchase'
  | 'earn'
  | 'stake_hold'
  | 'stake_release'
  | 'transfer'
  | 'fee'
  | 'refund'
  | 'redemption';

export type CreditHoldStatus = 'active' | 'released' | 'consumed';

// Credit Account
export interface CreditBalance {
  available: number;
  reserved: number;
  total: number;
}

// Credit Holds
export interface CreditHold {
  id: string;
  accountId: string;
  matchId: string;
  amountReserved: number;
  status: CreditHoldStatus;
  createdAt: string;
  releasedAt: string | null;
  match?: {
    id: string;
    status: string;
    challenge: {
      title: string;
      slug: string;
    };
  };
}

// Credit Ledger Entry (Transaction)
export interface CreditTransaction {
  id: string;
  idempotencyKey: string;
  accountId: string;
  counterpartyAccountId: string | null;
  type: CreditTransactionType;
  amount: number;
  matchId: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  description?: string;
  match?: {
    id: string;
    challenge: {
      title: string;
      slug: string;
    };
  };
}

// Credit Purchase Package
export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number; // in cents
  currency: string;
  popular?: boolean;
  bonusCredits?: number;
  description?: string;
}

// Stripe Checkout Response
export interface StripeCheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
}

// API Responses
export interface CreditBalanceResponse {
  data: CreditBalance;
}

export interface CreditHoldsResponse {
  data: CreditHold[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreditHistoryResponse {
  data: CreditTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreditHistoryFilters {
  page?: number;
  limit?: number;
  type?: CreditTransactionType;
  startDate?: string;
  endDate?: string;
}

// Display helpers
export const transactionTypeLabels: Record<CreditTransactionType, string> = {
  purchase: 'Purchase',
  earn: 'Earned',
  stake_hold: 'Stake Hold',
  stake_release: 'Stake Released',
  transfer: 'Transfer',
  fee: 'Fee',
  refund: 'Refund',
  redemption: 'Redemption',
};

export const transactionTypeColors: Record<CreditTransactionType, string> = {
  purchase: 'bg-green-500',
  earn: 'bg-emerald-500',
  stake_hold: 'bg-orange-500',
  stake_release: 'bg-blue-500',
  transfer: 'bg-purple-500',
  fee: 'bg-red-500',
  refund: 'bg-cyan-500',
  redemption: 'bg-amber-500',
};

export const transactionTypeIcons: Record<CreditTransactionType, string> = {
  purchase: 'credit-card',
  earn: 'trophy',
  stake_hold: 'lock',
  stake_release: 'unlock',
  transfer: 'arrow-right-left',
  fee: 'minus-circle',
  refund: 'rotate-ccw',
  redemption: 'zap',
};

export const holdStatusLabels: Record<CreditHoldStatus, string> = {
  active: 'Active',
  released: 'Released',
  consumed: 'Consumed',
};

export const holdStatusColors: Record<CreditHoldStatus, string> = {
  active: 'bg-yellow-500',
  released: 'bg-green-500',
  consumed: 'bg-gray-500',
};

// Default credit packages (would normally come from backend)
export const defaultCreditPackages: CreditPackage[] = [
  {
    id: 'pkg_starter',
    name: 'Starter',
    credits: 100,
    price: 499, // $4.99
    currency: 'USD',
    description: 'Perfect for trying out the platform',
  },
  {
    id: 'pkg_competitor',
    name: 'Competitor',
    credits: 500,
    price: 1999, // $19.99
    currency: 'USD',
    popular: true,
    bonusCredits: 50,
    description: 'Most popular choice for active competitors',
  },
  {
    id: 'pkg_champion',
    name: 'Champion',
    credits: 1000,
    price: 3499, // $34.99
    currency: 'USD',
    bonusCredits: 150,
    description: 'Best value for serious players',
  },
  {
    id: 'pkg_legend',
    name: 'Legend',
    credits: 2500,
    price: 7999, // $79.99
    currency: 'USD',
    bonusCredits: 500,
    description: 'Ultimate package for power users',
  },
];

// Utility functions
export function formatCredits(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount);
}

export function formatPrice(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function getTransactionSign(type: CreditTransactionType): '+' | '-' | '' {
  switch (type) {
    case 'purchase':
    case 'earn':
    case 'stake_release':
    case 'refund':
      return '+';
    case 'stake_hold':
    case 'fee':
    case 'redemption':
      return '-';
    case 'transfer':
      return '';
    default:
      return '';
  }
}
