import React, { useMemo, useState } from 'react';
import { useExtension } from '../../context';
import { useVSCodeMessaging } from '../../hooks/useVSCodeMessaging';
import { ChallengeCategory } from '../../types/messages';
import { ChallengeCard } from './ChallengeCard';
import { CategoryFilter } from './CategoryFilter';
import './ChallengesTab.css';

// Available categories for the filter
const AVAILABLE_CATEGORIES: ChallengeCategory[] = [
  'frontend',
  'backend',
  'fullstack',
  'algorithm',
  'devops',
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
  const [selectedCategory, setSelectedCategory] = useState<ChallengeCategory | null>(null);

  // Filter challenges based on selected category
  const filteredChallenges = useMemo(() => {
    if (selectedCategory === null) {
      return state.challenges;
    }
    return state.challenges.filter((c) => c.category === selectedCategory);
  }, [state.challenges, selectedCategory]);

  // Handle category filter change
  const handleCategoryChange = (category: string | null) => {
    setSelectedCategory(category as ChallengeCategory | null);
    filterChallenges(category as ChallengeCategory | null);
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
        <CategoryFilter
          categories={AVAILABLE_CATEGORIES}
          selected={selectedCategory}
          onChange={handleCategoryChange}
          disabled={true}
        />
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
          <CategoryFilter
            categories={AVAILABLE_CATEGORIES}
            selected={selectedCategory}
            onChange={handleCategoryChange}
          />
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
              onClick={() => handleCategoryChange(null)}
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
      <CategoryFilter
        categories={AVAILABLE_CATEGORIES}
        selected={selectedCategory}
        onChange={handleCategoryChange}
      />

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
