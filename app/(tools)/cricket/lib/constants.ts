import { useAuthStore } from '@/stores/auth-store';

/// Dynamic team name — reads from auth store, fallback to generic
export function getTeamName(): string {
  const { userTeams, currentTeamId } = useAuthStore.getState();
  return userTeams.find(t => t.team_id === currentTeamId)?.team_name ?? 'Cricket Team';
}

/// Short team code (first letters of each word, max 3 chars)
export function getTeamCode(): string {
  const name = getTeamName();
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
}

/// For backward compat — components that import TEAM_NAME get the dynamic value
/// Get current team's logo URL (or null if no logo)
export function getTeamLogoUrl(): string | null {
  const { userTeams, currentTeamId } = useAuthStore.getState();
  const team = userTeams.find(t => t.team_id === currentTeamId);
  // Sunrisers has a local static logo as fallback
  if (team?.team_slug === 'sunrisers-manteca' && !team.logo_url) return '/cricket-logo.png';
  return team?.logo_url ?? null;
}

export const TEAM_NAME = 'Sunrisers Manteca'; // Legacy — prefer getTeamName()

export type CategoryConfig = {
  key: string;
  label: string;
  iconName: string;
  color: string;
  bgColor: string;
  borderColor: string;
};

export const EXPENSE_CATEGORIES: CategoryConfig[] = [
  { key: 'ground', label: 'Jerseys', iconName: 'FaTshirt', color: '#16A34A', bgColor: '#DCFCE7', borderColor: '#16A34A' },
  { key: 'equipment', label: 'Cricket Kit', iconName: 'MdSportsCricket', color: '#3B82F6', bgColor: '#DBEAFE', borderColor: '#3B82F6' },
  { key: 'tournament', label: 'Tournament', iconName: 'FaTrophy', color: '#2A8FC2', bgColor: '#DBEEF9', borderColor: '#2A8FC2' },
  { key: 'food', label: 'Food & Drinks', iconName: 'FaUtensils', color: '#EF4444', bgColor: '#FEF2F2', borderColor: '#EF4444' },
  { key: 'other', label: 'Other', iconName: 'FaBox', color: '#6B7280', bgColor: '#F3F4F6', borderColor: '#6B7280' },
];

export const PLAYER_ROLES = [
  { key: 'batsman', label: 'Batsman', icon: '🏏' },
  { key: 'bowler', label: 'Bowler', icon: '🎯' },
  { key: 'all-rounder', label: 'All-Rounder', icon: '⭐' },
  { key: 'keeper', label: 'Wicket Keeper', icon: '🧤' },
] as const;

export const BATTING_STYLES = [
  { key: 'right', label: 'Right Hand' },
  { key: 'left', label: 'Left Hand' },
] as const;

export const BOWLING_STYLES = [
  { key: 'pace', label: 'Pace' },
  { key: 'medium', label: 'Medium' },
  { key: 'spin', label: 'Spin' },
] as const;

export const SHIRT_SIZES = [
  { key: 'XS', label: 'XS', color: '#06B6D4' },
  { key: 'S', label: 'S', color: '#3B82F6' },
  { key: 'M', label: 'M', color: '#F59E0B' },
  { key: 'L', label: 'L', color: '#16A34A' },
  { key: 'XL', label: 'XL', color: '#D97706' },
  { key: 'XXL', label: 'XXL', color: '#EF4444' },
] as const;

export const SEASON_TYPES = [
  { key: 'spring', label: 'Spring' },
  { key: 'summer', label: 'Summer' },
  { key: 'fall', label: 'Fall' },
] as const;

export function getCategoryConfig(key: string): CategoryConfig {
  return EXPENSE_CATEGORIES.find((c) => c.key === key) ?? EXPENSE_CATEGORIES[4];
}
