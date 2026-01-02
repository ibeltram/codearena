import React, { useMemo, useState } from 'react';
import { useExtension } from '../../context';
import { useVSCodeMessaging } from '../../hooks/useVSCodeMessaging';
import { ChallengeCategory } from '../../types/messages';
import { ChallengeCard } from './ChallengeCard';
import './ChallengesTab.css';

// Category options for the filter
const CATEGORIES: Array<{ value: ChallengeCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'fullstack', label: 'Fullstack' },
  { value: 'algorithm', label: 'Algorithm' },
  { value: 'devops', label: 'DevOps' },
];

/**
 * ChallengesTab - Main container for the challenges list
 *
 * Includes:
 * - Category filter
 * - Scrollable list of challenges
 * - Loading, error, and empty states
 */
export function ChallengesTab() {
  const { state, dispatch } = useExtension();
  const { joinMatch, openChallengeInWeb, refreshChallenges, filterChallenges } =
    useVSCodeMessaging();

  // Local filter state (could also be persisted in context)
  const [selectedCategory, setSelectedCategory] = useState<ChallengeCategory | 'all'>('all');

  // Filter challenges based on selected category
  const filteredChallenges = useMemo(() => {
    if (selectedCategory === 'all') {
      return state.challenges;
    }
    return state.challenges.filter((c) => c.category === selectedCategory);
  }, [state.challenges, selectedCategory]);

  // Handle category filter change
  const handleCategoryChange = (category: ChallengeCategory | 'all') => {
    setSelectedCategory(category);
    filterChallenges(category === 'all' ? null : category);
  };

  // Handle join action
  const handleJoin = (challengeId: string) => {
    joinMatch(challengeId);
  };

  // Handle view action
  const handleView = (challengeSlug: string) => {
    openChallengeInWeb(challengeSlug);
  };

  // Handle retry action
  const handleRetry = () => {
    refreshChallenges();
  };

  // Loading state
  if (state.challengesLoading) {
    return (
      <div className="challenges-tab">
        <div className="challenges-tab__filter">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              className="challenges-tab__filter-button challenges-tab__filter-button--loading"
              disabled
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="challenges-tab__list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="challenges-tab__skeleton">
              <div className="challenges-tab__skeleton-title" />
              <div className="challenges-tab__skeleton-badges" />
              <div className="challenges-tab__skeleton-info" />
              <div className="challenges-tab__skeleton-actions" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (state.challengesError) {
    return (
      <div className="challenges-tab">
        <div className="challenges-tab__error">
          <div className="challenges-tab__error-icon">&#x26A0;</div>
          <div className="challenges-tab__error-title">Failed to load challenges</div>
          <div className="challenges-tab__error-message">{state.challengesError}</div>
          <button className="challenges-tab__error-button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (filteredChallenges.length === 0) {
    const isEmpty = state.challenges.length === 0;
    return (
      <div className="challenges-tab">
        {!isEmpty && (
          <div className="challenges-tab__filter">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                className={`challenges-tab__filter-button ${
                  selectedCategory === cat.value ? 'challenges-tab__filter-button--active' : ''
                }`}
                onClick={() => handleCategoryChange(cat.value)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
        <div className="challenges-tab__empty">
          <div className="challenges-tab__empty-icon">&#x1F50D;</div>
          <div className="challenges-tab__empty-title">
            {isEmpty ? 'No challenges available' : 'No matching challenges'}
          </div>
          <div className="challenges-tab__empty-message">
            {isEmpty
              ? 'Check back later for new challenges.'
              : 'Try adjusting your filter or check back later.'}
          </div>
          {!isEmpty && (
            <button
              className="challenges-tab__empty-button"
              onClick={() => handleCategoryChange('all')}
            >
              Clear filter
            </button>
          )}
        </div>
      </div>
    );
  }

  // Normal state with challenges
  return (
    <div className="challenges-tab">
      {/* Category filter */}
      <div className="challenges-tab__filter">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            className={`challenges-tab__filter-button ${
              selectedCategory === cat.value ? 'challenges-tab__filter-button--active' : ''
            }`}
            onClick={() => handleCategoryChange(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Challenges list */}
      <div className="challenges-tab__list">
        {filteredChallenges.map((challenge) => (
          <ChallengeCard
            key={challenge.id}
            challenge={challenge}
            onJoin={handleJoin}
            onView={handleView}
          />
        ))}
      </div>
    </div>
  );
}

export default ChallengesTab;
