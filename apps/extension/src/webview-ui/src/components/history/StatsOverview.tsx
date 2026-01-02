import React, { useMemo } from 'react';
import { MatchHistoryItem } from '../../types/messages';
import './StatsOverview.css';

export interface StatsOverviewProps {
  /** Array of match history items to calculate stats from */
  matches: MatchHistoryItem[];
  /** Additional CSS class names */
  className?: string;
}

export interface MatchStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

/**
 * StatsOverview - Display win/loss/draw summary with win rate
 *
 * Shows:
 * - Total completed matches
 * - Win/Loss/Draw breakdown with colors
 * - Win rate percentage
 *
 * Layout: Compact horizontal display suitable for sidebar
 */
export function StatsOverview({ matches, className = '' }: StatsOverviewProps) {
  const stats = useMemo<MatchStats>(() => {
    const completed = matches.filter((m) => m.result !== 'in_progress');
    const wins = completed.filter((m) => m.result === 'win').length;
    const losses = completed.filter((m) => m.result === 'loss').length;
    const draws = completed.filter((m) => m.result === 'draw').length;
    const total = completed.length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    return { wins, losses, draws, total, winRate };
  }, [matches]);

  // Don't render if no completed matches
  if (stats.total === 0) {
    return null;
  }

  return (
    <div className={`stats-overview ${className}`}>
      {/* Total matches count */}
      <div className="stats-overview__total">
        <span className="stats-overview__value">{stats.total}</span>
        <span className="stats-overview__label">Matches</span>
      </div>

      {/* Win/Loss/Draw breakdown */}
      <div className="stats-overview__breakdown">
        <div className="stats-overview__stat stats-overview__stat--win">
          <span className="stats-overview__stat-value">{stats.wins}</span>
          <span className="stats-overview__stat-label">W</span>
        </div>
        <div className="stats-overview__stat stats-overview__stat--loss">
          <span className="stats-overview__stat-value">{stats.losses}</span>
          <span className="stats-overview__stat-label">L</span>
        </div>
        <div className="stats-overview__stat stats-overview__stat--draw">
          <span className="stats-overview__stat-value">{stats.draws}</span>
          <span className="stats-overview__stat-label">D</span>
        </div>
      </div>

      {/* Win rate percentage */}
      <div className="stats-overview__winrate">
        <span className="stats-overview__value">{stats.winRate}%</span>
        <span className="stats-overview__label">Win Rate</span>
      </div>
    </div>
  );
}

export default StatsOverview;
