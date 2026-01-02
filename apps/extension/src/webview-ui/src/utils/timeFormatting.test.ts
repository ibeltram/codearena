/**
 * Unit tests for time formatting utility functions
 *
 * Tests all functions with various inputs including edge cases.
 */

import { describe, it, expect } from 'vitest';
import { formatTime, formatDate, formatTimeLimit } from './timeFormatting';

// ============================================
// formatTime Tests
// ============================================

describe('formatTime', () => {
  describe('basic formatting', () => {
    it('should format 0 seconds as "00:00"', () => {
      expect(formatTime(0)).toBe('00:00');
    });

    it('should format 30 seconds as "00:30"', () => {
      expect(formatTime(30)).toBe('00:30');
    });

    it('should format 59 seconds as "00:59"', () => {
      expect(formatTime(59)).toBe('00:59');
    });

    it('should format 60 seconds as "01:00"', () => {
      expect(formatTime(60)).toBe('01:00');
    });

    it('should format 90 seconds as "01:30"', () => {
      expect(formatTime(90)).toBe('01:30');
    });

    it('should format 5 minutes (300 seconds) as "05:00"', () => {
      expect(formatTime(300)).toBe('05:00');
    });

    it('should format 59:59 correctly', () => {
      expect(formatTime(59 * 60 + 59)).toBe('59:59');
    });
  });

  describe('hour formatting', () => {
    it('should format 1 hour (3600 seconds) as "01:00:00"', () => {
      expect(formatTime(3600)).toBe('01:00:00');
    });

    it('should format 1 hour 1 second as "01:00:01"', () => {
      expect(formatTime(3601)).toBe('01:00:01');
    });

    it('should format 1 hour 1 minute 1 second as "01:01:01"', () => {
      expect(formatTime(3661)).toBe('01:01:01');
    });

    it('should format 2 hours 30 minutes as "02:30:00"', () => {
      expect(formatTime(2 * 3600 + 30 * 60)).toBe('02:30:00');
    });

    it('should format 10 hours as "10:00:00"', () => {
      expect(formatTime(10 * 3600)).toBe('10:00:00');
    });

    it('should format 99 hours 59 minutes 59 seconds correctly', () => {
      expect(formatTime(99 * 3600 + 59 * 60 + 59)).toBe('99:59:59');
    });
  });

  describe('edge cases', () => {
    it('should treat negative values as 0', () => {
      expect(formatTime(-1)).toBe('00:00');
      expect(formatTime(-100)).toBe('00:00');
      expect(formatTime(-Infinity)).toBe('00:00');
    });

    it('should handle very large values', () => {
      // 1000 hours
      expect(formatTime(1000 * 3600)).toBe('1000:00:00');
    });

    it('should handle floating point seconds by flooring', () => {
      expect(formatTime(90.5)).toBe('01:30');
      expect(formatTime(90.9)).toBe('01:30');
      expect(formatTime(59.999)).toBe('00:59');
    });
  });
});

// ============================================
// formatDate Tests
// ============================================

describe('formatDate', () => {
  // Helper to create dates relative to now
  // Uses millisecond arithmetic to avoid timezone issues
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  function daysAgo(days: number): string {
    const now = Date.now();
    // Subtract full days worth of milliseconds, plus a few hours to ensure we're in the "middle" of that day
    const targetMs = now - (days * ONE_DAY_MS) - (6 * 60 * 60 * 1000); // 6 hours back from now
    return new Date(targetMs).toISOString();
  }

  describe('null/undefined handling', () => {
    it('should return "In progress" for undefined', () => {
      expect(formatDate(undefined)).toBe('In progress');
    });

    it('should return "In progress" for null', () => {
      expect(formatDate(null)).toBe('In progress');
    });

    it('should return "In progress" for empty string', () => {
      // Empty string is falsy
      expect(formatDate('')).toBe('In progress');
    });
  });

  describe('relative date formatting', () => {
    it('should return "Today" for dates from less than 24 hours ago', () => {
      // 6 hours ago should definitely be "Today"
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      expect(formatDate(sixHoursAgo)).toBe('Today');
    });

    it('should return "Yesterday" for dates from about 1 day ago', () => {
      expect(formatDate(daysAgo(1))).toBe('Yesterday');
    });

    it('should return "X days ago" for dates 2-6 days ago', () => {
      expect(formatDate(daysAgo(2))).toBe('2 days ago');
      expect(formatDate(daysAgo(3))).toBe('3 days ago');
      expect(formatDate(daysAgo(4))).toBe('4 days ago');
      expect(formatDate(daysAgo(5))).toBe('5 days ago');
      expect(formatDate(daysAgo(6))).toBe('6 days ago');
    });

    it('should return short date format for dates 7+ days ago', () => {
      // 7 days ago - should show month/day format
      const result = formatDate(daysAgo(7));
      // The result should be a short date format (not a relative format)
      expect(result).not.toBe('7 days ago');
      expect(result).not.toBe('Today');
      expect(result).not.toBe('Yesterday');
    });
  });

  describe('invalid date handling', () => {
    it('should return "Invalid date" for invalid date strings', () => {
      expect(formatDate('not-a-date')).toBe('Invalid date');
      expect(formatDate('2026-99-99')).toBe('Invalid date');
    });
  });

  describe('date boundary cases', () => {
    it('should handle very recent dates as "Today"', () => {
      // A date from right now should be "Today"
      const now = new Date().toISOString();
      expect(formatDate(now)).toBe('Today');
    });

    it('should handle valid ISO date strings', () => {
      // Just verify it doesn't crash with valid ISO strings
      const result = formatDate('2020-01-01T12:00:00Z');
      expect(typeof result).toBe('string');
      expect(result).not.toBe('Invalid date');
      expect(result).not.toBe('In progress');
    });
  });
});

// ============================================
// formatTimeLimit Tests
// ============================================

describe('formatTimeLimit', () => {
  describe('minutes only', () => {
    it('should format 15 minutes as "15 min"', () => {
      expect(formatTimeLimit(15)).toBe('15 min');
    });

    it('should format 30 minutes as "30 min"', () => {
      expect(formatTimeLimit(30)).toBe('30 min');
    });

    it('should format 45 minutes as "45 min"', () => {
      expect(formatTimeLimit(45)).toBe('45 min');
    });

    it('should format 59 minutes as "59 min"', () => {
      expect(formatTimeLimit(59)).toBe('59 min');
    });
  });

  describe('hours only', () => {
    it('should format 60 minutes as "1 hr"', () => {
      expect(formatTimeLimit(60)).toBe('1 hr');
    });

    it('should format 120 minutes as "2 hr"', () => {
      expect(formatTimeLimit(120)).toBe('2 hr');
    });

    it('should format 180 minutes as "3 hr"', () => {
      expect(formatTimeLimit(180)).toBe('3 hr');
    });
  });

  describe('hours and minutes', () => {
    it('should format 90 minutes as "1 hr 30 min"', () => {
      expect(formatTimeLimit(90)).toBe('1 hr 30 min');
    });

    it('should format 75 minutes as "1 hr 15 min"', () => {
      expect(formatTimeLimit(75)).toBe('1 hr 15 min');
    });

    it('should format 150 minutes as "2 hr 30 min"', () => {
      expect(formatTimeLimit(150)).toBe('2 hr 30 min');
    });

    it('should format 61 minutes as "1 hr 1 min"', () => {
      expect(formatTimeLimit(61)).toBe('1 hr 1 min');
    });
  });

  describe('edge cases', () => {
    it('should handle 0 minutes', () => {
      expect(formatTimeLimit(0)).toBe('0 min');
    });

    it('should handle 1 minute', () => {
      expect(formatTimeLimit(1)).toBe('1 min');
    });

    it('should handle large values', () => {
      // 24 hours
      expect(formatTimeLimit(1440)).toBe('24 hr');
      // 48 hours 30 minutes
      expect(formatTimeLimit(2910)).toBe('48 hr 30 min');
    });
  });
});
