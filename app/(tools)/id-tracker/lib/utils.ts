export type UrgencyLevel = 'expired' | 'critical' | 'warning' | 'ontrack' | 'safe' | 'noexpiry';

export function getUrgency(expiryDate: string | null): UrgencyLevel {
  if (!expiryDate) return 'noexpiry';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + 'T00:00:00');
  const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'critical';
  if (daysLeft <= 90) return 'warning';
  if (daysLeft <= 180) return 'ontrack';
  return 'safe';
}

export function getDaysLeft(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + 'T00:00:00');
  return Math.floor((expiry.getTime() - today.getTime()) / 86400000);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
