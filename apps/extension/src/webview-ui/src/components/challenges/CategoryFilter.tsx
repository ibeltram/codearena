import React from 'react';
import './CategoryFilter.css';

/**
 * Props for CategoryFilter component
 */
export interface CategoryFilterProps {
  /** List of available category values */
  categories: string[];
  /** Currently selected category, or null for "All" */
  selected: string | null;
  /** Callback when selection changes */
  onChange: (category: string | null) => void;
  /** Whether the filter is disabled (e.g., during loading) */
  disabled?: boolean;
  /** Optional label for the "All" option (defaults to "All") */
  allLabel?: string;
}

/**
 * CategoryFilter - Horizontal chip-style filter for selecting categories
 *
 * Features:
 * - "All" option to clear filter
 * - Dynamic list from available categories
 * - Horizontal chip layout with wrap
 * - Active state for selected category
 * - Keyboard accessible
 * - Overflow handling for many categories
 */
export function CategoryFilter({
  categories,
  selected,
  onChange,
  disabled = false,
  allLabel = 'All',
}: CategoryFilterProps) {
  const handleClick = (category: string | null) => {
    if (!disabled) {
      onChange(category);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, category: string | null) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(category);
    }
  };

  return (
    <div className="category-filter" role="group" aria-label="Category filter">
      {/* "All" option */}
      <button
        type="button"
        className={`category-filter__chip ${
          selected === null ? 'category-filter__chip--active' : ''
        } ${disabled ? 'category-filter__chip--disabled' : ''}`}
        onClick={() => handleClick(null)}
        onKeyDown={(e) => handleKeyDown(e, null)}
        disabled={disabled}
        aria-pressed={selected === null}
      >
        {allLabel}
      </button>

      {/* Category options */}
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          className={`category-filter__chip ${
            selected === category ? 'category-filter__chip--active' : ''
          } ${disabled ? 'category-filter__chip--disabled' : ''}`}
          onClick={() => handleClick(category)}
          onKeyDown={(e) => handleKeyDown(e, category)}
          disabled={disabled}
          aria-pressed={selected === category}
        >
          {formatCategoryLabel(category)}
        </button>
      ))}
    </div>
  );
}

/**
 * Format a category value into a display label
 * Capitalizes first letter and handles common transformations
 */
function formatCategoryLabel(category: string): string {
  // Handle special cases
  const labelMap: Record<string, string> = {
    frontend: 'Frontend',
    backend: 'Backend',
    fullstack: 'Fullstack',
    algorithm: 'Algorithm',
    devops: 'DevOps',
    ml: 'ML',
    mobile: 'Mobile',
    database: 'Database',
    security: 'Security',
    testing: 'Testing',
  };

  if (labelMap[category.toLowerCase()]) {
    return labelMap[category.toLowerCase()];
  }

  // Default: capitalize first letter
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export default CategoryFilter;
