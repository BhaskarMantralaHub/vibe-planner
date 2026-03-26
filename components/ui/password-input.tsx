'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useBrand } from '@/lib/brand';
import { brandFocus } from './input';

/* ── Password requirement rules (single source of truth) ── */
export const passwordRequirements = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function allRequirementsMet(password: string) {
  return passwordRequirements.every((r) => r.test(password));
}

/* ── Eye icon SVG ── */
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/* ── Requirements checklist ── */
function RequirementsChecklist({ password }: { password: string }) {
  if (password.length === 0) return null;
  return (
    <div className="mt-2 mb-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--dim)]">Password must have</p>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        {passwordRequirements.map((r) => {
          const met = r.test(password);
          return (
            <div key={r.label} className="flex items-center gap-1.5">
              <span className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                met ? 'bg-[var(--green)] text-white' : 'border border-[var(--border)] text-[var(--dim)]'
              )}>
                {met ? '✓' : ''}
              </span>
              <span className={cn('text-[12px]', met ? 'text-[var(--text)] font-medium' : 'text-[var(--muted)]')}>
                {r.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Match status badge ── */
function MatchStatus({ password, confirm }: { password: string; confirm: string }) {
  const mismatch = confirm.length > 0 && password !== confirm;
  const match = password.length > 0 && confirm.length > 0 && password === confirm;

  if (!mismatch && !match) return <div className="h-7" />;

  return (
    <div className="h-7">
      {mismatch && (
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--red)]/10 px-3 py-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--red)] text-[10px] text-white">&#10005;</span>
          <span className="text-[12px] font-medium text-[var(--red)]">Passwords do not match</span>
        </div>
      )}
      {match && (
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--green)]/10 px-3 py-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--green)] text-[10px] text-white">&#10003;</span>
          <span className="text-[12px] font-medium text-[var(--green)]">Passwords match</span>
        </div>
      )}
    </div>
  );
}

/* ── PasswordInput component ── */
interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  brand?: 'toolkit' | 'cricket';
  showRequirements?: boolean;
}

function PasswordInput({
  label,
  error,
  brand: brandProp,
  showRequirements = false,
  className,
  value,
  ref,
  ...props
}: PasswordInputProps & { ref?: React.Ref<HTMLInputElement> }) {
  const [visible, setVisible] = useState(false);
  const { brand: contextBrand } = useBrand();
  const brand = brandProp ?? contextBrand;
  const password = typeof value === 'string' ? value : '';

  return (
    <div>
      {label && (
        <label className="mb-1 block text-[13px] font-medium text-[var(--muted)]">{label}</label>
      )}
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          value={value}
          className={cn(
            'w-full rounded-xl border bg-[var(--surface)] px-4 py-3 pr-11 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] transition-all',
            error
              ? 'border-[var(--red)] focus:border-[var(--red)] focus:ring-1 focus:ring-[var(--red)]/30'
              : `border-[var(--border)] ${brandFocus[brand]}`,
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--dim)] hover:text-[var(--muted)] transition-colors"
          tabIndex={-1}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {error && <p className="mt-1 text-[12px] text-[var(--red)]">{error}</p>}
      {showRequirements && <RequirementsChecklist password={password} />}
    </div>
  );
}

export { PasswordInput, RequirementsChecklist, MatchStatus, EyeIcon };
export type { PasswordInputProps };
