const AUTH_MAX_ATTEMPTS = 5;
const AUTH_WINDOW_MS = 60_000;

const attempts: number[] = [];

export function sanitizeAuthError(msg: string): string {
  const lower = msg.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Invalid email or password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  if (lower.includes('user already registered')) {
    return 'An account with this email already exists.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (lower.includes('signup is not allowed')) {
    return 'Sign-up is currently disabled.';
  }
  if (lower.includes('password')) {
    return 'Password does not meet requirements.';
  }

  return 'Something went wrong. Please try again.';
}

export function validatePassword(pass: string): string | null {
  if (pass.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Z]/.test(pass)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(pass)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(pass)) {
    return 'Password must contain at least one number.';
  }

  return null;
}

export function isRateLimited(): boolean {
  const now = Date.now();
  // Remove expired attempts
  while (attempts.length > 0 && now - attempts[0] > AUTH_WINDOW_MS) {
    attempts.shift();
  }
  if (attempts.length >= AUTH_MAX_ATTEMPTS) {
    return true;
  }
  attempts.push(now);
  return false;
}

export function getAllowedEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSignupEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SIGNUP_ENABLED === 'true';
}
