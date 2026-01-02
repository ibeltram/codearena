/**
 * Time formatting utility functions
 *
 * Pure functions for formatting time values in the webview.
 */

/**
 * Format seconds into HH:MM:SS or MM:SS
 *
 * @param seconds - Time in seconds (negative values treated as 0)
 * @returns Formatted time string (e.g., "01:30" or "01:00:00")
 *
 * @example
 * formatTime(0)      // "00:00"
 * formatTime(90)     // "01:30"
 * formatTime(3600)   // "01:00:00"
 * formatTime(3661)   // "01:01:01"
 * formatTime(-5)     // "00:00"
 */
export function formatTime(seconds: number): string {
  // Handle negative values
  if (seconds < 0) seconds = 0;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Format a date string to a relative or short display format
 *
 * @param dateString - ISO date string, or undefined/null
 * @returns Human-readable date string
 *
 * @example
 * formatDate(undefined)         // "In progress"
 * formatDate(todayISOString)    // "Today"
 * formatDate(yesterdayISO)      // "Yesterday"
 * formatDate(threeDaysAgoISO)   // "3 days ago"
 * formatDate(twoWeeksAgoISO)    // "Dec 15" (short date)
 */
export function formatDate(dateString?: string | null): string {
  if (!dateString) return 'In progress';

  const date = new Date(dateString);

  // Handle invalid dates
  if (isNaN(date.getTime())) return 'Invalid date';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a time limit in minutes to a human-readable string
 *
 * @param minutes - Time limit in minutes
 * @returns Formatted time string (e.g., "30 min", "1 hr", "2 hr 30 min")
 *
 * @example
 * formatTimeLimit(30)   // "30 min"
 * formatTimeLimit(60)   // "1 hr"
 * formatTimeLimit(90)   // "1 hr 30 min"
 * formatTimeLimit(120)  // "2 hr"
 */
export function formatTimeLimit(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}
