import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sanitizeAuthError,
  validatePassword,
  isRateLimited,
  getAllowedEmails,
  isSignupEnabled,
} from '../../lib/auth';

// ─── sanitizeAuthError ───────────────────────────────────────────────

describe('sanitizeAuthError', () => {
  it('returns friendly message for invalid login credentials', () => {
    expect(sanitizeAuthError('Invalid login credentials')).toBe(
      'Invalid email or password.'
    );
  });

  it('handles case-insensitive match for invalid login', () => {
    expect(sanitizeAuthError('INVALID LOGIN CREDENTIALS foo')).toBe(
      'Invalid email or password.'
    );
  });

  it('returns friendly message for email not confirmed', () => {
    expect(sanitizeAuthError('Email not confirmed')).toBe(
      'Please confirm your email before signing in.'
    );
  });

  it('returns friendly message for user already registered', () => {
    expect(sanitizeAuthError('User already registered')).toBe(
      'An account with this email already exists. Try signing in instead.'
    );
  });

  it('returns friendly message for rate limit', () => {
    expect(sanitizeAuthError('rate limit exceeded')).toBe(
      'Too many attempts. Please wait a moment and try again.'
    );
  });

  it('returns friendly message for too many requests', () => {
    expect(sanitizeAuthError('Too many requests')).toBe(
      'Too many attempts. Please wait a moment and try again.'
    );
  });

  it('returns friendly message for signup not allowed', () => {
    expect(sanitizeAuthError('Signup is not allowed for this instance')).toBe(
      'Sign-up is currently disabled.'
    );
  });

  it('returns friendly message for password issues', () => {
    expect(sanitizeAuthError('Password should be at least 6 characters')).toBe(
      'Password does not meet requirements.'
    );
  });

  it('returns generic message for unknown errors', () => {
    expect(sanitizeAuthError('Some completely unknown error')).toBe(
      'Something went wrong. Please try again.'
    );
  });

  it('returns generic message for empty string', () => {
    expect(sanitizeAuthError('')).toBe(
      'Something went wrong. Please try again.'
    );
  });
});

// ─── validatePassword ────────────────────────────────────────────────

describe('validatePassword', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('Ab1')).toBe(
      'Password must be at least 8 characters.'
    );
  });

  it('rejects passwords without an uppercase letter', () => {
    expect(validatePassword('abcdefg1')).toBe(
      'Password must contain at least one uppercase letter.'
    );
  });

  it('rejects passwords without a lowercase letter', () => {
    expect(validatePassword('ABCDEFG1')).toBe(
      'Password must contain at least one lowercase letter.'
    );
  });

  it('rejects passwords without a number', () => {
    expect(validatePassword('Abcdefgh')).toBe(
      'Password must contain at least one number.'
    );
  });

  it('returns null for a valid password', () => {
    expect(validatePassword('Abcdefg1')).toBeNull();
  });

  it('returns null for a strong password with special characters', () => {
    expect(validatePassword('P@ssw0rd!!')).toBeNull();
  });
});

// ─── isRateLimited ───────────────────────────────────────────────────

describe('isRateLimited', () => {
  // Each test gets a fresh module to reset the internal attempts array
  let freshRateLimited: typeof isRateLimited;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import('@/lib/auth');
    freshRateLimited = mod.isRateLimited;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not rate limited for the first few attempts', () => {
    expect(freshRateLimited()).toBe(false);
    expect(freshRateLimited()).toBe(false);
    expect(freshRateLimited()).toBe(false);
  });

  it('becomes rate limited after 5 attempts within the window', () => {
    for (let i = 0; i < 5; i++) {
      freshRateLimited();
    }
    expect(freshRateLimited()).toBe(true);
  });

  it('resets after the time window expires', () => {
    for (let i = 0; i < 5; i++) {
      freshRateLimited();
    }
    expect(freshRateLimited()).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(freshRateLimited()).toBe(false);
  });
});

// ─── getAllowedEmails ────────────────────────────────────────────────

describe('getAllowedEmails', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('returns empty array when env var is not set', () => {
    delete process.env.NEXT_PUBLIC_ALLOWED_EMAILS;
    expect(getAllowedEmails()).toEqual([]);
  });

  it('returns empty array when env var is empty string', () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAILS = '';
    expect(getAllowedEmails()).toEqual([]);
  });

  it('returns single email trimmed and lowercased', () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAILS = '  Alice@Example.COM ';
    expect(getAllowedEmails()).toEqual(['alice@example.com']);
  });

  it('returns multiple emails trimmed and lowercased', () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAILS =
      'Alice@Example.com , BOB@test.com , carol@foo.bar';
    expect(getAllowedEmails()).toEqual([
      'alice@example.com',
      'bob@test.com',
      'carol@foo.bar',
    ]);
  });

  it('filters out blank entries from trailing commas', () => {
    process.env.NEXT_PUBLIC_ALLOWED_EMAILS = 'a@b.com,,c@d.com,';
    expect(getAllowedEmails()).toEqual(['a@b.com', 'c@d.com']);
  });
});

// ─── isSignupEnabled ─────────────────────────────────────────────────

describe('isSignupEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('returns true when env var is "true"', () => {
    process.env.NEXT_PUBLIC_SIGNUP_ENABLED = 'true';
    expect(isSignupEnabled()).toBe(true);
  });

  it('returns false when env var is "false"', () => {
    process.env.NEXT_PUBLIC_SIGNUP_ENABLED = 'false';
    expect(isSignupEnabled()).toBe(false);
  });

  it('returns false when env var is not set', () => {
    delete process.env.NEXT_PUBLIC_SIGNUP_ENABLED;
    expect(isSignupEnabled()).toBe(false);
  });

  it('returns false for unexpected values like "1" or "yes"', () => {
    process.env.NEXT_PUBLIC_SIGNUP_ENABLED = '1';
    expect(isSignupEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_SIGNUP_ENABLED = 'yes';
    expect(isSignupEnabled()).toBe(false);
  });
});
