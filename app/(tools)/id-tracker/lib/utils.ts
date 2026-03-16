import { differenceInDays, differenceInMonths, differenceInYears, format, parseISO, startOfDay, subMonths, subYears } from 'date-fns';

export type UrgencyLevel = 'expired' | 'critical' | 'warning' | 'ontrack' | 'safe' | 'noexpiry';

export function getUrgency(expiryDate: string | null): UrgencyLevel {
  if (!expiryDate) return 'noexpiry';
  const days = differenceInDays(parseISO(expiryDate), startOfDay(new Date()));
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 90) return 'warning';
  if (days <= 180) return 'ontrack';
  return 'safe';
}

export function getDaysLeft(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  return differenceInDays(parseISO(expiryDate), startOfDay(new Date()));
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d, yyyy');
}

export function formatDaysLeft(expiryDate: string | null): string {
  if (!expiryDate) return '';
  const today = startOfDay(new Date());
  const expiry = parseISO(expiryDate);
  const totalDays = Math.abs(differenceInDays(expiry, today));

  if (totalDays <= 30) return `${totalDays}d`;

  const start = today < expiry ? today : expiry;
  const end = today < expiry ? expiry : today;

  const years = differenceInYears(end, start);
  const afterYears = subYears(end, years);
  const months = differenceInMonths(afterYears, start);
  const afterMonths = subMonths(afterYears, months);
  const days = differenceInDays(afterMonths, start);

  if (years > 0 && months > 0) return `${years}y ${months}mo`;
  if (years > 0) return `${years}y`;
  if (months > 0 && days > 0) return `${months}mo ${days}d`;
  if (months > 0) return `${months}mo`;
  return `${totalDays}d`;
}
