/**
 * Tournament Types
 *
 * Type definitions for tournaments, registrations, brackets, and related data.
 */

export type TournamentStatus =
  | 'draft'
  | 'registration_open'
  | 'registration_closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type TournamentFormat =
  | 'single_elimination'
  | 'double_elimination'
  | 'swiss'
  | 'ladder'
  | 'round_robin';

export type BracketMatchStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'bye';

export type BracketSide = 'winners' | 'losers' | 'grand_finals';

export interface PrizePool {
  total?: number;
  currency?: string;
  distribution?: {
    place: number;
    amount: number;
    percentage?: number;
  }[];
  sponsors?: {
    name: string;
    logoUrl?: string;
    contribution?: number;
  }[];
}

export interface TournamentRules {
  maxMatchDuration?: number;
  checkInRequired?: boolean;
  checkInWindowMinutes?: number;
  allowLateRegistration?: boolean;
  [key: string]: unknown;
}

export interface TournamentChallenge {
  id: string;
  title: string;
  category: string;
  difficulty: string;
}

export interface Tournament {
  id: string;
  name: string;
  description: string | null;
  format: TournamentFormat;
  status: TournamentStatus;
  maxParticipants: number;
  minParticipants: number;
  registrationStartAt: string | null;
  registrationEndAt: string | null;
  startAt: string;
  endAt: string | null;
  checkInStartAt: string | null;
  checkInEndAt: string | null;
  entryFeeCredits: number;
  prizePoolJson: PrizePool;
  rulesJson: TournamentRules;
  createdAt: string;
  participantCount: number;
  challenge?: TournamentChallenge | null;
}

export interface TournamentListItem {
  id: string;
  name: string;
  description: string | null;
  format: TournamentFormat;
  status: TournamentStatus;
  maxParticipants: number;
  minParticipants: number;
  registrationStartAt: string | null;
  registrationEndAt: string | null;
  startAt: string;
  endAt: string | null;
  entryFeeCredits: number;
  prizePoolJson: PrizePool;
  createdAt: string;
  participantCount: number;
}

export interface TournamentsResponse {
  data: TournamentListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TournamentFilters {
  page?: number;
  limit?: number;
  status?: TournamentStatus;
  format?: TournamentFormat;
  upcoming?: boolean;
}

export interface TournamentParticipant {
  id: string;
  seed: number | null;
  isCheckedIn: boolean;
  eliminatedAt: string | null;
  finalPlacement: number | null;
  registeredAt: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface TournamentParticipantsResponse {
  tournamentId: string;
  participants: TournamentParticipant[];
  total: number;
}

export interface BracketMatch {
  id: string;
  tournamentId: string;
  round: number;
  position: number;
  bracketSide: BracketSide | null;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  matchId: string | null;
  status: BracketMatchStatus;
  scheduledAt: string | null;
  completedAt: string | null;
  nextMatchId: string | null;
  loserNextMatchId: string | null;
}

export interface BracketParticipantInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface TournamentBracketResponse {
  tournamentId: string;
  format: TournamentFormat;
  status: TournamentStatus;
  rounds: Record<number, BracketMatch[]>;
  matches: BracketMatch[];
  participants: Record<string, BracketParticipantInfo>;
  totalRounds: number;
}

export interface TournamentRegistrationResponse {
  id: string;
  tournamentId: string;
  userId: string;
  registeredAt: string;
  entryFeeHoldId: string | null;
  message: string;
}

// Display helpers
export const statusLabels: Record<TournamentStatus, string> = {
  draft: 'Draft',
  registration_open: 'Registration Open',
  registration_closed: 'Registration Closed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const statusColors: Record<TournamentStatus, string> = {
  draft: 'bg-gray-500',
  registration_open: 'bg-green-500',
  registration_closed: 'bg-yellow-500',
  in_progress: 'bg-blue-500',
  completed: 'bg-purple-500',
  cancelled: 'bg-red-500',
};

export const formatLabels: Record<TournamentFormat, string> = {
  single_elimination: 'Single Elimination',
  double_elimination: 'Double Elimination',
  swiss: 'Swiss',
  ladder: 'Ladder',
  round_robin: 'Round Robin',
};

export const formatDescriptions: Record<TournamentFormat, string> = {
  single_elimination: 'Lose once and you\'re out',
  double_elimination: 'Lose twice to be eliminated',
  swiss: 'Multiple rounds with similar-record opponents',
  ladder: 'Climb the ranks by challenging others',
  round_robin: 'Everyone plays everyone',
};

// Helper to check if registration is available
export function canRegister(tournament: Tournament | TournamentListItem): boolean {
  if (tournament.status !== 'registration_open') return false;
  if (tournament.participantCount >= tournament.maxParticipants) return false;
  if (tournament.registrationEndAt && new Date(tournament.registrationEndAt) < new Date()) return false;
  return true;
}

// Helper to format prize pool display
export function formatPrizePool(prizePool: PrizePool): string {
  if (!prizePool.total) return 'TBD';
  const currency = prizePool.currency || 'credits';
  if (currency === 'credits') {
    return `${prizePool.total.toLocaleString()} credits`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
  }).format(prizePool.total);
}

// Helper to get time until tournament starts
export function getTimeUntilStart(startAt: string): string {
  const start = new Date(startAt);
  const now = new Date();
  const diff = start.getTime() - now.getTime();

  if (diff <= 0) return 'Started';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Check-in window status
export type CheckInWindowStatus =
  | 'not_configured'
  | 'not_started'
  | 'open'
  | 'closed';

// Helper to check check-in window status
export function getCheckInWindowStatus(tournament: Tournament): CheckInWindowStatus {
  if (!tournament.checkInStartAt && !tournament.checkInEndAt) {
    return 'not_configured';
  }

  const now = new Date();

  if (tournament.checkInStartAt && now < new Date(tournament.checkInStartAt)) {
    return 'not_started';
  }

  if (tournament.checkInEndAt && now > new Date(tournament.checkInEndAt)) {
    return 'closed';
  }

  return 'open';
}

// Helper to check if user can check in
export function canCheckIn(tournament: Tournament, isRegistered: boolean, isCheckedIn: boolean): boolean {
  if (!isRegistered || isCheckedIn) return false;
  if (tournament.status !== 'registration_open' && tournament.status !== 'registration_closed') return false;

  const windowStatus = getCheckInWindowStatus(tournament);
  // If no check-in window configured, allow check-in anytime before tournament starts
  if (windowStatus === 'not_configured') {
    return tournament.status !== 'in_progress' && tournament.status !== 'completed';
  }

  return windowStatus === 'open';
}

// Helper to get time until check-in opens/closes
export function getCheckInWindowTime(tournament: Tournament): string | null {
  const windowStatus = getCheckInWindowStatus(tournament);

  if (windowStatus === 'not_configured') return null;

  const now = new Date();

  if (windowStatus === 'not_started' && tournament.checkInStartAt) {
    const start = new Date(tournament.checkInStartAt);
    const diff = start.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `Opens in ${hours}h ${minutes}m`;
    return `Opens in ${minutes}m`;
  }

  if (windowStatus === 'open' && tournament.checkInEndAt) {
    const end = new Date(tournament.checkInEndAt);
    const diff = end.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `Closes in ${hours}h ${minutes}m`;
    return `Closes in ${minutes}m`;
  }

  return null;
}

// ============================================
// Prize Claim Types
// ============================================

export type PrizeType = 'cash' | 'crypto' | 'hardware' | 'saas_bundle';
export type PrizeClaimStatus = 'pending' | 'approved' | 'fulfilled' | 'denied';

export interface ShippingAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface PaymentDetails {
  paypalEmail?: string;
  walletAddress?: string;
  shippingAddress?: ShippingAddress;
}

export interface PrizeClaim {
  id: string;
  tournamentId: string;
  userId?: string;
  prizeType: PrizeType;
  amountOrBundleRef: string;
  placement: number;
  paymentDetailsJson?: PaymentDetails;
  status: PrizeClaimStatus;
  adminNotes?: string;
  denialReason?: string;
  createdAt: string;
  reviewedAt?: string;
  fulfilledAt?: string;
  tournament?: {
    id: string;
    name: string;
  };
  user?: {
    id: string;
    displayName: string;
    email: string;
  };
}

export interface PrizeClaimsResponse {
  data: PrizeClaim[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PrizeClaimFilters {
  page?: number;
  limit?: number;
  status?: PrizeClaimStatus;
  tournamentId?: string;
}

export interface CreatePrizeClaimRequest {
  prizeType: PrizeType;
  paymentDetails: PaymentDetails;
}

export interface CreatePrizeClaimResponse {
  id: string;
  tournamentId: string;
  placement: number;
  prizeType: PrizeType;
  value: string;
  status: PrizeClaimStatus;
  message: string;
}

export interface AdminUpdatePrizeClaimRequest {
  status: 'approved' | 'denied' | 'fulfilled';
  adminNotes?: string;
  denialReason?: string;
}

// Display helpers for prize claims
export const prizeTypeLabels: Record<PrizeType, string> = {
  cash: 'Cash',
  crypto: 'Cryptocurrency',
  hardware: 'Hardware',
  saas_bundle: 'SaaS Bundle',
};

export const prizeClaimStatusLabels: Record<PrizeClaimStatus, string> = {
  pending: 'Pending Review',
  approved: 'Approved',
  fulfilled: 'Fulfilled',
  denied: 'Denied',
};

export const prizeClaimStatusColors: Record<PrizeClaimStatus, string> = {
  pending: 'bg-yellow-500',
  approved: 'bg-green-500',
  fulfilled: 'bg-blue-500',
  denied: 'bg-red-500',
};
